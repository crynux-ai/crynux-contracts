// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libs/VSS.sol";
import "./libs/Hamming.sol";
import "./Node.sol";
import "./QOS.sol";
import "./TaskQueue.sol";
import "./NetworkStats.sol";


contract VSSTask is Ownable {

    /* Events */
    event TaskQueued(bytes32 taskIDCommitment);

    event TaskStarted(bytes32 taskIDCommitment, address selectedNode);

    event TaskParametersUploaded(
        bytes32 taskIDCommitment,
        address selectedNode
    );

    event TaskErrorReported(
        bytes32 taskIDCommitment,
        address selectedNode,
        TaskError error
    );

    event TaskScoreReady(
        bytes32 taskIDCommitment,
        address selectedNode,
        bytes taskScore
    );

    event TaskValidated(bytes32 taskIDCommitment);

    event TaskEndSuccess(bytes32 taskIDCommitment);

    event TaskEndInvalidated(bytes32 taskIDCommitment, address selectedNode);

    event TaskEndAborted(
        bytes32 taskIDCommitment,
        address abortIssuer,
        TaskStatus lastStatus,
        TaskAbortReason abortReason
    );

    /* Task type */
    enum TaskType {
        SD,
        LLM,
        SD_FT
    }

    /* States */
    enum TaskStatus {
        Queued,
        Started,
        ParametersUploaded,
        ErrorReported,
        ScoreReady,
        Validated,
        GroupValidated,
        EndInvalidated,
        EndSuccess,
        EndAborted,
        EndGroupRefund,
        EndGroupSuccess
    }

    enum TaskStateTransition {
        ReportTaskParametersUploaded,
        SubmitTaskScore,
        ReportTaskError,
        ValidateSingleTask,
        ValidateTaskGroup,
        ReportTaskResultUploaded,
        AbortTask
    }

    enum TaskAbortReason {
        Timeout,
        ModelDownloadFailed,
        IncorrectResult,
        TaskFeeTooLow
    }

    enum TaskError {
        ParametersValidationFailed
    }

    struct TaskInfo {
        TaskType taskType;
        address creator;
        bytes32 taskIDCommitment;
        bytes32 samplingSeed;
        bytes32 nonce;
        uint256 sequence;
        TaskStatus status;
        address selectedNode;
        uint256 timeout;
        bytes score;
        uint taskFee;
        uint taskSize;
        string modelID;
        uint minimumVRAM;
        string requiredGPU;
        uint requiredGPUVRAM;
        string taskVersion;
        TaskAbortReason abortReason;
        TaskError error;
        // record payment infomation in group validate
        address[] paymentAddresses;
        uint[] payments;
        // useful for calculating qos score
        uint startBlocknum;
        uint finishBlocknum;
    }

    mapping(bytes32 => TaskInfo) private tasks;
    mapping(bytes32 => uint) private usedNonces;
    mapping(address => bytes32) private nodeTasks;
    uint256 private nextSequence;
    address private relayAddress;
    uint256 private timeout;

    uint private distanceThreshold;

    Node private node;
    QOS private qos;
    TaskQueue private taskQueue;
    NetworkStats private networkStats;

    constructor(
        Node nodeInstance,
        QOS qosInstance,
        TaskQueue taskQueueInstance,
        NetworkStats networkStatsInstance
    ) Ownable(msg.sender) {
        nextSequence = 1;
        timeout = 3 minutes;
        distanceThreshold = 24;

        node = nodeInstance;
        qos = qosInstance;
        taskQueue = taskQueueInstance;
        networkStats = networkStatsInstance;
    }

    /* Interfaces for owner */
    function setRelayAddress(address addr) external onlyOwner {
        relayAddress = addr;
    }

    function updateDistanceThreshold(uint threshold) public onlyOwner {
        distanceThreshold = threshold;
    }

    function updateTimeout(uint t) public onlyOwner {
        timeout = t;
    }

    /* Interfaces for node contract */
    function nodeAvailableCallback(address root) external {
        Node.NodeInfo memory nodeInfo = node.getNodeInfo(root);
        try
            taskQueue.popTask(
                nodeInfo.gpu.name,
                nodeInfo.gpu.vram,
                nodeInfo.version,
                nodeInfo.lastModelID
            )
        returns (bytes32 taskIDCommitment) {
            networkStats.taskDequeue();
            changeTaskState(taskIDCommitment, TaskStatus.Started);
        } catch Error(string memory reason) {
            string memory target = "No available task";
            if (keccak256(bytes(reason)) != keccak256(bytes(target))) {
                revert(reason);
            }
        }
    }

    /* Interfaces for applications */

    function createTask(
        TaskType taskType,
        bytes32 taskIDCommitment,
        bytes32 nonce,
        string calldata modelID,
        uint minimumVRAM,
        string calldata requiredGPU,
        uint requiredGPUVRAM,
        string calldata taskVersion,
        uint taskSize
    ) public payable {
        if (taskType == TaskType.LLM || taskType == TaskType.SD_FT) {
            require(bytes(requiredGPU).length > 0, "GPU name is empty");
        }

        uint taskFee = msg.value;
        require(taskFee > 0, "Task fee cannot be 0");

        require(
            usedNonces[nonce] == 0 ||
                usedNonces[nonce] <= block.number - 100000,
            "Nonce is used"
        );
        usedNonces[nonce] = block.number;

        TaskInfo memory taskInfo;
        taskInfo.taskType = taskType;
        taskInfo.creator = msg.sender;
        taskInfo.taskIDCommitment = taskIDCommitment;
        taskInfo.nonce = nonce;
        taskInfo.timeout = block.timestamp + timeout;
        taskInfo.taskFee = taskFee;
        taskInfo.modelID = modelID;
        taskInfo.minimumVRAM = minimumVRAM;
        taskInfo.requiredGPU = requiredGPU;
        taskInfo.requiredGPUVRAM = requiredGPUVRAM;
        taskInfo.taskVersion = taskVersion;
        taskInfo.taskSize = taskSize;

        taskInfo.sequence = nextSequence;
        nextSequence += 1;

        taskInfo.samplingSeed = VSS.generateSamplingSeed(taskIDCommitment);

        tasks[taskIDCommitment] = taskInfo;

        networkStats.taskCreated();

        bytes32 seed = keccak256(
            abi.encodePacked(
                blockhash(block.number - 1),
                taskIDCommitment,
                bytes(modelID)
            )
        );

        try
            node.randomSelectNode(
                seed,
                minimumVRAM,
                requiredGPU,
                requiredGPUVRAM,
                taskVersion,
                modelID
            )
        returns (address nodeAddress) {
            tasks[taskIDCommitment].selectedNode = nodeAddress;
            changeTaskState(taskIDCommitment, TaskStatus.Started);
        } catch Error(string memory reason) {
            string memory target = "No available node";
            if (keccak256(bytes(reason)) == keccak256(bytes(target))) {
                changeTaskState(taskIDCommitment, TaskStatus.Queued);
            } else {
                revert(reason);
            }
        }
    }

    function validateSingleTask(
        bytes32 taskIDCommitment,
        bytes calldata vrfProof,
        bytes calldata publicKey
    ) public {
        TaskInfo storage taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(
            taskIDCommitment,
            TaskStateTransition.ValidateSingleTask
        );


        // Sampling Number validation
        VSS.validateSamplingNumber(
            vrfProof,
            publicKey,
            taskInfo.creator,
            taskInfo.samplingSeed,
            false
        );

        if (taskInfo.status == TaskStatus.ErrorReported) {
            changeTaskState(taskIDCommitment, TaskStatus.EndAborted);
        } else if (taskInfo.status == TaskStatus.ScoreReady) {
            changeTaskState(taskIDCommitment, TaskStatus.Validated);
        }
    }

    function validateTaskGroup(
        bytes32 taskIDCommitment1,
        bytes32 taskIDCommitment2,
        bytes32 taskIDCommitment3,
        bytes32 taskGUID,
        bytes calldata vrfProof,
        bytes calldata publicKey
    ) public {
        bytes32[3] memory taskIDCommitments = [
            taskIDCommitment1,
            taskIDCommitment2,
            taskIDCommitment3
        ];

        checkStateTransitionAllowance(
            taskIDCommitment1,
            TaskStateTransition.ValidateTaskGroup
        );
        checkStateTransitionAllowance(
            taskIDCommitment2,
            TaskStateTransition.ValidateTaskGroup
        );
        checkStateTransitionAllowance(
            taskIDCommitment3,
            TaskStateTransition.ValidateTaskGroup
        );

        require(
            tasks[taskIDCommitment1].sequence <
                tasks[taskIDCommitment2].sequence,
            "Invalid task sequence"
        );
        require(
            tasks[taskIDCommitment1].sequence <
                tasks[taskIDCommitment3].sequence,
            "Invalid task sequence"
        );

        // Sampling Number validation
        VSS.validateSamplingNumber(
            vrfProof,
            publicKey,
            tasks[taskIDCommitment1].creator,
            tasks[taskIDCommitment1].samplingSeed,
            true
        );

        // Task relationship validation
        for (uint i = 0; i < 3; i++) {
            VSS.validateGUID(
                taskGUID,
                taskIDCommitments[i],
                tasks[taskIDCommitments[i]].nonce
            );
        }

        // Task parameters validation
        // already performed by the Relay before DA is used.

        // update each node's qos
        updateTaskGroupQOS(
            taskIDCommitment1,
            taskIDCommitment2,
            taskIDCommitment3
        );

        // Task result validation
        uint finishedTaskCount = 0;
        TaskInfo[] memory finishedTasks = new TaskInfo[](3);
        for (uint i = 0; i < 3; i++) {
            if (tasks[taskIDCommitments[i]].status != TaskStatus.EndAborted) {
                finishedTasks[finishedTaskCount] = tasks[taskIDCommitments[i]];
                finishedTaskCount += 1;
            }
        }

        TaskStatus[3] memory finishedTaskStatus = [
            TaskStatus.EndAborted,
            TaskStatus.EndAborted,
            TaskStatus.EndAborted
        ];
        uint groupValidatedIndex = 3;

        if (finishedTaskCount == 2) {
            bool same = compareTaskScore(
                finishedTasks[0].taskIDCommitment,
                finishedTasks[1].taskIDCommitment
            );
            if (same && finishedTasks[0].status == TaskStatus.ScoreReady) {
                // two task scores are same
                finishedTaskStatus[0] = TaskStatus.GroupValidated;
                finishedTaskStatus[1] = TaskStatus.EndGroupRefund;
                groupValidatedIndex = 0;
            }
        } else if (finishedTaskCount == 3) {
            bool same1 = compareTaskScore(
                finishedTasks[0].taskIDCommitment,
                finishedTasks[1].taskIDCommitment
            );
            bool same2 = compareTaskScore(
                finishedTasks[0].taskIDCommitment,
                finishedTasks[2].taskIDCommitment
            );
            bool same3 = compareTaskScore(
                finishedTasks[1].taskIDCommitment,
                finishedTasks[2].taskIDCommitment
            );

            if (same1) {
                if (finishedTasks[0].status == TaskStatus.ScoreReady) {
                    // task 1 is same as task 2, and don't report error
                    finishedTaskStatus[0] = TaskStatus.GroupValidated;
                    finishedTaskStatus[1] = TaskStatus.EndGroupRefund;
                    groupValidatedIndex = 0;
                }
                if (same2) {
                    // all 3 tasks are same
                    finishedTaskStatus[2] = TaskStatus.EndGroupRefund;
                } else {
                    // task 3 is different
                    finishedTaskStatus[2] = TaskStatus.EndInvalidated;
                }
            } else if (same2) {
                if (finishedTasks[0].status == TaskStatus.ScoreReady) {
                    // task 1 is same as task 3, and don't report error
                    finishedTaskStatus[0] = TaskStatus.GroupValidated;
                    finishedTaskStatus[2] = TaskStatus.EndGroupRefund;
                    groupValidatedIndex = 0;
                }
                // task 2 is different
                finishedTaskStatus[1] = TaskStatus.EndInvalidated;
            } else if (same3) {
                if (finishedTasks[1].status == TaskStatus.ScoreReady) {
                    // task 2 is same as task 3, and don't report error
                    finishedTaskStatus[1] = TaskStatus.GroupValidated;
                    finishedTaskStatus[2] = TaskStatus.EndGroupRefund;
                    groupValidatedIndex = 1;
                }
                // task 1 is different
                finishedTaskStatus[0] = TaskStatus.EndInvalidated;
            }
            // else, all 3 tasks are different
        }

        // calculate each node's payment
        if (groupValidatedIndex < 3) {
            bytes32 taskIDCommitment = finishedTasks[groupValidatedIndex]
                .taskIDCommitment;
            for (uint i = 0; i < finishedTaskCount; i++) {
                if (
                    finishedTaskStatus[i] == TaskStatus.GroupValidated ||
                    finishedTaskStatus[i] == TaskStatus.EndGroupRefund
                ) {
                    address nodeAddress = finishedTasks[i].selectedNode;
                    tasks[taskIDCommitment].paymentAddresses.push(nodeAddress);
                    uint fee = (tasks[taskIDCommitment].taskFee *
                        qos.getCurrentTaskScore(nodeAddress)) /
                        qos.getTaskScoreLimit();
                    tasks[taskIDCommitment].payments.push(fee);
                }
            }
        }

        // change tasks' state
        for (uint i = 0; i < finishedTaskCount; i++) {
            changeTaskState(
                finishedTasks[i].taskIDCommitment,
                finishedTaskStatus[i]
            );
        }
    }

    /* Interfaces for nodes */

    function reportTaskError(bytes32 taskIDCommitment, TaskError error) public {
        TaskInfo storage taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(
            taskIDCommitment,
            TaskStateTransition.ReportTaskError
        );

        taskInfo.error = error;
        taskInfo.finishBlocknum = block.number;

        changeTaskState(taskIDCommitment, TaskStatus.ErrorReported);
    }

    function submitTaskScore(
        bytes32 taskIDCommitment,
        bytes calldata taskScore
    ) public {
        TaskInfo storage taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(
            taskIDCommitment,
            TaskStateTransition.SubmitTaskScore
        );

        require(taskScore.length > 0, "Invalid task score");

        taskInfo.score = taskScore;
        taskInfo.finishBlocknum = block.number;

        changeTaskState(taskIDCommitment, TaskStatus.ScoreReady);
    }

    /* Interfaces for both applications and nodes */

    function abortTask(
        bytes32 taskIDCommitment,
        TaskAbortReason abortReason
    ) public {
        TaskInfo storage taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(
            taskIDCommitment,
            TaskStateTransition.AbortTask
        );

        taskInfo.abortReason = abortReason;
        taskInfo.finishBlocknum = block.number;

        changeTaskState(taskIDCommitment, TaskStatus.EndAborted);
    }

    function getTask(bytes32 taskIDCommitment) public view returns (TaskInfo memory) {
        return tasks[taskIDCommitment];
    }

    function getNodeTask(address nodeAddress) public view returns (bytes32) {
        return nodeTasks[nodeAddress];
    }

    /* Interfaces for Relay */

    function reportTaskParametersUploaded(bytes32 taskIDCommitment) public {
        checkStateTransitionAllowance(
            taskIDCommitment,
            TaskStateTransition.ReportTaskParametersUploaded
        );

        changeTaskState(taskIDCommitment, TaskStatus.ParametersUploaded);
    }

    function reportTaskResultUploaded(bytes32 taskIDCommitment) public {
        checkStateTransitionAllowance(
            taskIDCommitment,
            TaskStateTransition.ReportTaskResultUploaded
        );

        changeTaskState(taskIDCommitment, TaskStatus.EndSuccess);
    }

    /* State Transition */
    function checkStateTransitionAllowance(
        bytes32 taskIDCommitment,
        TaskStateTransition transition
    ) private view {
        TaskInfo storage taskInfo = tasks[taskIDCommitment];
        require(taskInfo.taskIDCommitment != 0, "Task not found");

        if (transition == TaskStateTransition.ReportTaskParametersUploaded) {
            require(msg.sender == relayAddress, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.Started,
                "Illegal previous task state"
            );
        } else if (transition == TaskStateTransition.SubmitTaskScore) {
            require(msg.sender == taskInfo.selectedNode, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ParametersUploaded,
                "Illegal previous task state"
            );
        } else if (transition == TaskStateTransition.ReportTaskError) {
            require(msg.sender == taskInfo.selectedNode, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ParametersUploaded,
                "Illegal previous task state"
            );
        } else if (transition == TaskStateTransition.ValidateSingleTask) {
            require(msg.sender == taskInfo.creator, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ScoreReady ||
                    taskInfo.status == TaskStatus.ErrorReported,
                "Illegal previous task state"
            );
        } else if (transition == TaskStateTransition.ValidateTaskGroup) {
            require(msg.sender == taskInfo.creator, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ScoreReady ||
                    taskInfo.status == TaskStatus.ErrorReported ||
                    taskInfo.status == TaskStatus.EndAborted,
                "Illegal previous task state"
            );
        } else if (transition == TaskStateTransition.ReportTaskResultUploaded) {
            require(msg.sender == relayAddress, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.Validated ||
                    taskInfo.status == TaskStatus.GroupValidated,
                "Illegal previous task state"
            );
        } else if (transition == TaskStateTransition.AbortTask) {
            require(
                msg.sender == taskInfo.creator ||
                    msg.sender == taskInfo.selectedNode,
                "Invalid caller"
            );

            require(block.timestamp > taskInfo.timeout, "Timeout not reached");
        }
    }

    function changeTaskState(
        bytes32 taskIDCommitment,
        TaskStatus status
    ) private {
        TaskInfo storage taskInfo = tasks[taskIDCommitment];
        TaskStatus lastStatus = taskInfo.status;
        taskInfo.status = status;

        if (status == TaskStatus.Queued) {
            taskQueue.pushTask(
                taskIDCommitment,
                taskInfo.taskFee,
                taskInfo.taskSize,
                taskInfo.modelID,
                taskInfo.minimumVRAM,
                taskInfo.requiredGPU,
                taskInfo.requiredGPUVRAM,
                taskInfo.taskVersion
            );
            networkStats.taskEnqueue();
            emit TaskQueued(taskIDCommitment);

            if (taskQueue.size() > taskQueue.getSizeLimit()) {
                bytes32 rmTaskIDCommitment = taskQueue.getCheapestTask();
                TaskInfo storage rmTaskInfo = tasks[rmTaskIDCommitment];
                rmTaskInfo.abortReason = TaskAbortReason.TaskFeeTooLow;
                changeTaskState(rmTaskIDCommitment, TaskStatus.EndAborted);
            }
        } else if (status == TaskStatus.Started) {
            nodeTasks[taskInfo.selectedNode] = taskIDCommitment;
            networkStats.taskStarted();
            emit TaskStarted(taskIDCommitment, taskInfo.selectedNode);
        } else if (status == TaskStatus.ParametersUploaded) {
            emit TaskParametersUploaded(
                taskInfo.taskIDCommitment,
                taskInfo.selectedNode
            );
        } else if (status == TaskStatus.ScoreReady) {
            emit TaskScoreReady(
                taskInfo.taskIDCommitment,
                taskInfo.selectedNode,
                taskInfo.score
            );
        } else if (status == TaskStatus.ErrorReported) {
            emit TaskErrorReported(
                taskInfo.taskIDCommitment,
                taskInfo.selectedNode,
                taskInfo.error
            );
        } else if (
            status == TaskStatus.Validated ||
            status == TaskStatus.GroupValidated
        ) {
            emit TaskValidated(taskInfo.taskIDCommitment);
        } else if (status == TaskStatus.EndSuccess) {
            (bool success, ) = taskInfo.selectedNode.call{
                value: taskInfo.taskFee
            }("");
            require(success, "Token transfer failed");
            node.finishTask(taskInfo.selectedNode);
            delete nodeTasks[taskInfo.selectedNode];
            networkStats.taskFinished();
            emit TaskEndSuccess(taskInfo.taskIDCommitment);
        } else if (status == TaskStatus.EndAborted) {
            if (lastStatus == TaskStatus.Queued) {
                // remove task from task queue
                taskQueue.removeTask(taskIDCommitment);
                networkStats.taskDequeue();
            }
            (bool success, ) = taskInfo.creator.call{value: taskInfo.taskFee}(
                ""
            );
            require(success, "Token transfer failed");
            node.finishTask(taskInfo.selectedNode);
            delete nodeTasks[taskInfo.selectedNode];
            networkStats.taskFinished();
            emit TaskEndAborted(
                taskInfo.taskIDCommitment,
                msg.sender,
                lastStatus,
                taskInfo.abortReason
            );
        } else if (status == TaskStatus.EndInvalidated) {
            (bool success, ) = taskInfo.creator.call{value: taskInfo.taskFee}(
                ""
            );
            require(success, "Token transfer failed");
            node.slash(taskInfo.selectedNode);
            delete nodeTasks[taskInfo.selectedNode];
            networkStats.taskFinished();
            emit TaskEndInvalidated(
                taskInfo.taskIDCommitment,
                taskInfo.selectedNode
            );
        } else if (status == TaskStatus.EndGroupRefund) {
            (bool success, ) = taskInfo.creator.call{value: taskInfo.taskFee}(
                ""
            );
            require(success, "Token transfer failed");
            node.finishTask(taskInfo.selectedNode);
            delete nodeTasks[taskInfo.selectedNode];
            networkStats.taskFinished();
            emit TaskEndSuccess(taskInfo.taskIDCommitment);
        } else if (status == TaskStatus.EndGroupSuccess) {
            for (uint i = 0; i < taskInfo.payments.length; i++) {
                address nodeAddress = taskInfo.paymentAddresses[i];
                uint fee = taskInfo.payments[i];
                (bool success, ) = nodeAddress.call{value: fee}("");
                require(success, "Token transfer failed");
            }
            node.finishTask(taskInfo.selectedNode);
            delete nodeTasks[taskInfo.selectedNode];
            networkStats.taskFinished();
            emit TaskEndSuccess(taskInfo.taskIDCommitment);
        }
    }

    /* Internal method */
    function compareTaskScore(
        bytes32 taskIDCommitment1,
        bytes32 taskIDCommitment2
    ) internal view returns (bool) {
        TaskInfo storage taskInfo1 = tasks[taskIDCommitment1];
        TaskInfo storage taskInfo2 = tasks[taskIDCommitment2];

        require(
            taskInfo1.taskType == taskInfo2.taskType,
            "different task type"
        );

        if (taskInfo1.status != taskInfo2.status) {
            return false;
        }
        if (taskInfo1.status == TaskStatus.ScoreReady) {
            if (
                taskInfo1.taskType == TaskType.SD ||
                taskInfo1.taskType == TaskType.SD_FT
            ) {
                return
                    Hamming.compareHamming(
                        taskInfo1.score,
                        taskInfo2.score,
                        distanceThreshold
                    );
            } else if (taskInfo1.taskType == TaskType.LLM) {
                return keccak256(taskInfo1.score) == keccak256(taskInfo2.score);
            } else {
                revert("Invalid task type");
            }
        } else {
            return true;
        }
    }

    function compareTaskOrder(
        bytes32 taskIDCommitment1,
        bytes32 taskIDCommitment2
    ) internal view returns (bool) {
        TaskInfo storage taskInfo1 = tasks[taskIDCommitment1];
        TaskInfo storage taskInfo2 = tasks[taskIDCommitment2];

        uint timeCost1 = taskInfo1.finishBlocknum - taskInfo1.startBlocknum;
        uint timeCost2 = taskInfo2.finishBlocknum - taskInfo2.startBlocknum;
        if (timeCost1 == timeCost2) {
            return taskInfo1.sequence < taskInfo2.sequence;
        }
        return timeCost1 < timeCost2;
    }

    function updateTaskGroupQOS(
        bytes32 taskIDCommitment1,
        bytes32 taskIDCommitment2,
        bytes32 taskIDCommitment3
    ) internal {
        bytes32[3] memory taskIDCommitments = [
            taskIDCommitment1,
            taskIDCommitment2,
            taskIDCommitment3
        ];
        uint[3] memory qosOrders = [uint(0), 0, 0];
        bool order1 = compareTaskOrder(taskIDCommitment1, taskIDCommitment2);
        bool order2 = compareTaskOrder(taskIDCommitment1, taskIDCommitment3);
        bool order3 = compareTaskOrder(taskIDCommitment2, taskIDCommitment3);
        if (order1 && order2) {
            qosOrders[0] = 0;
            if (order3) {
                qosOrders[1] = 1;
                qosOrders[2] = 2;
            } else {
                qosOrders[1] = 2;
                qosOrders[2] = 1;
            }
        } else if (!order1 && order3) {
            qosOrders[0] = 1;
            if (order2) {
                qosOrders[1] = 0;
                qosOrders[2] = 2;
            } else {
                qosOrders[1] = 2;
                qosOrders[2] = 0;
            }
        } else if (!order2 && !order3) {
            qosOrders[0] = 2;
            if (order1) {
                qosOrders[1] = 0;
                qosOrders[2] = 1;
            } else {
                qosOrders[1] = 1;
                qosOrders[2] = 0;
            }
        }
        for (uint i = 0; i < 3; i++) {
            address nodeAddress = tasks[taskIDCommitments[i]].selectedNode;
            qos.addTaskScore(nodeAddress, i);
        }
    }
}
