// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./Node.sol";
import "./Hamming.sol";
import "./QOS.sol";
import "./TaskQueue.sol";
import "./NetworkStats.sol";

contract Task is Ownable {

    uint private TASK_TYPE_SD = 0;
    uint private TASK_TYPE_LLM = 1;
    uint private TASK_TYPE_SD_FT = 2;

    struct TaskInfo {
        uint256 id;
        uint taskType;
        address creator;
        bytes32 taskHash;
        bytes32 dataHash;
        uint vramLimit;
        bool isSuccess;
        address[] selectedNodes;
        bytes32[] commitments;
        bytes32[] nonces;
        uint[] commitmentSubmitRounds;
        bytes[] results;
        uint[] resultDisclosedRounds;
        address resultNode;
        bool aborted;
        uint256 timeout;
        uint256 balance;
        uint256 totalBalance;
    }

    Node private node;
    QOS private qos;
    TaskQueue private taskQueue;
    NetworkStats private netStats;

    mapping(uint => TaskInfo) private tasks;
    mapping(address => uint256) private nodeTasks;
    uint256 private nextTaskId;

    uint private distanceThreshold;
    uint256 private timeout;

    uint256 private numSuccessTasks;
    uint256 private numAbortedTasks;

    event TaskPending(
        uint256 taskId,
        uint256 taskType,
        address indexed creator,
        bytes32 taskHash,
        bytes32 dataHash
    );
    event TaskStarted(
        uint256 taskId,
        uint256 taskType,
        address indexed creator,
        address indexed selectedNode,
        bytes32 taskHash,
        bytes32 dataHash,
        uint round
    );
    event TaskResultCommitmentsReady(uint256 indexed taskId);
    event TaskSuccess(uint256 indexed taskId, bytes result, address indexed resultNode);
    event TaskAborted(uint256 indexed taskId, string reason);
    event TaskResultUploaded(uint256 indexed taskId);

    event TaskNodeSuccess(uint indexed taskId, address nodeAddress, uint fee);
    event TaskNodeSlashed(uint indexed taskId, address nodeAddress);
    event TaskNodeCancelled(uint indexed taskId, address nodeAddress);

    constructor(
        Node nodeInstance,
        QOS qosInstance,
        TaskQueue taskQueueInstance,
        NetworkStats netStatsInstance
    ) {
        node = nodeInstance;
        qos = qosInstance;
        taskQueue = taskQueueInstance;
        netStats = netStatsInstance;

        nextTaskId = 1;
        distanceThreshold = 5;
        timeout = 15 minutes;
        numSuccessTasks = 0;
        numAbortedTasks = 0;
    }

    function createTask(
        uint taskType,
        bytes32 taskHash,
        bytes32 dataHash,
        uint vramLimit,
        uint cap,
        string calldata gpuName,
        uint gpuVram
    ) payable public {
        require(
            taskType == TASK_TYPE_SD || taskType == TASK_TYPE_LLM || taskType == TASK_TYPE_SD_FT,
            "Invalid task type"
        );
        if (taskType == TASK_TYPE_SD_FT) {
            require(bytes(gpuName).length > 0, "GPU name is empty");
        }
        uint taskFee = msg.value;

        TaskInfo memory taskInfo;

        taskInfo.id = nextTaskId++;
        taskInfo.creator = msg.sender;
        taskInfo.timeout = block.timestamp + timeout;
        taskInfo.balance = taskFee;
        taskInfo.totalBalance = taskFee;
        taskInfo.taskType = taskType;
        taskInfo.taskHash = taskHash;
        taskInfo.dataHash = dataHash;
        taskInfo.vramLimit = vramLimit;
        taskInfo.isSuccess = false;
        taskInfo.commitments = new bytes32[](3);
        taskInfo.nonces = new bytes32[](3);
        taskInfo.results = new bytes[](3);
        taskInfo.aborted = false;

        bytes32 seed = keccak256(
            abi.encodePacked(blockhash(block.number - 1), taskHash, dataHash)
        );
        bool useSameGPU = taskType == TASK_TYPE_LLM || bytes(gpuName).length > 0;
        try
            node.randomSelectNodes(
                3,
                vramLimit,
                useSameGPU,
                seed,
                gpuName,
                gpuVram
            )
        returns (address[] memory nodeAddresses) {
            emit TaskPending(
                taskInfo.id,
                taskType,
                taskInfo.creator,
                taskHash,
                dataHash
            );
            netStats.taskQueued();
            tasks[taskInfo.id] = taskInfo;
            for (uint i = 0; i < 3; i++) {
                address nodeAddress = nodeAddresses[i];
                tasks[taskInfo.id].selectedNodes.push(nodeAddress);
                nodeTasks[nodeAddress] = taskInfo.id;
                emit TaskStarted(
                    taskInfo.id,
                    taskType,
                    taskInfo.creator,
                    nodeAddress,
                    taskHash,
                    dataHash,
                    i
                );
            }
            netStats.taskStarted();
        } catch Error(string memory reason) {
            string memory target = "No available node";
            if (keccak256(bytes(reason)) == keccak256(bytes(target))) {
                if (taskQueue.size() == taskQueue.getSizeLimit()) {
                    TaskInQueue memory task = taskQueue.removeCheapestTask();
                    // stats task count in netstats
                    netStats.taskStarted();
                    netStats.taskFinished();
                    emit TaskAborted(task.id, "Task fee is too low");
                }
                emit TaskPending(
                    taskInfo.id,
                    taskType,
                    taskInfo.creator,
                    taskHash,
                    dataHash
                );
                netStats.taskQueued();
                
                bytes32 gpuID = bytes32(0);
                if (bytes(gpuName).length > 0) {
                    gpuID = keccak256(abi.encodePacked(gpuName, gpuVram));
                }
                taskQueue.pushTask(
                    taskInfo.id,
                    taskType,
                    taskInfo.creator,
                    taskHash,
                    dataHash,
                    vramLimit,
                    taskFee,
                    taskFee / cap,
                    gpuID
                );
            } else {
                revert(reason);
            }
        }
    }

    function nodeAvailableCallback(address root) external {
        if (taskQueue.size() == 0) {
            return;
        }

        try node.selectNodesWithRoot(root, 3) returns (
            address[] memory nodeAddresses
        ) {
            bool sameGPU = true;
            uint minVram = 0;
            bytes32 gpuID = bytes32(0);

            for (uint i = 0; i < 3; i++) {
                Node.NodeInfo memory nodeInfo = node.getNodeInfo(
                    nodeAddresses[i]
                );
                if (i == 0) {
                    minVram = nodeInfo.gpu.vram;
                    gpuID = nodeInfo.gpuID;
                } else {
                    if (nodeInfo.gpu.vram < minVram) {
                        minVram = nodeInfo.gpu.vram;
                    }
                    if (sameGPU && nodeInfo.gpuID != gpuID) {
                        sameGPU = false;
                    }
                }
            }
            if (!sameGPU) {
                gpuID = bytes32(0);
            }

            try taskQueue.popTask(sameGPU, minVram, gpuID) returns (
                TaskInQueue memory task
            ) {
                TaskInfo memory taskInfo;

                taskInfo.id = task.id;
                taskInfo.taskType = task.taskType;
                taskInfo.creator = task.creator;
                taskInfo.timeout = block.timestamp + timeout;
                taskInfo.taskHash = task.taskHash;
                taskInfo.dataHash = task.dataHash;
                taskInfo.vramLimit = task.vramLimit;
                taskInfo.balance = task.taskFee;
                taskInfo.totalBalance = task.taskFee;

                taskInfo.isSuccess = false;
                taskInfo.commitments = new bytes32[](3);
                taskInfo.nonces = new bytes32[](3);
                taskInfo.results = new bytes[](3);
                taskInfo.aborted = false;

                tasks[taskInfo.id] = taskInfo;
                for (uint i = 0; i < 3; i++) {
                    address nodeAddress = nodeAddresses[i];
                    tasks[taskInfo.id].selectedNodes.push(nodeAddress);
                    nodeTasks[nodeAddress] = taskInfo.id;
                    node.startTask(nodeAddress);
                    emit TaskStarted(
                        taskInfo.id,
                        taskInfo.taskType,
                        taskInfo.creator,
                        nodeAddress,
                        taskInfo.taskHash,
                        taskInfo.dataHash,
                        i
                    );
                }
                netStats.taskStarted();
            } catch Error(string memory reason) {
                string memory target = "No available task";
                if (keccak256(bytes(reason)) != keccak256(bytes(target))) {
                    revert(reason);
                }
            }
        } catch Error(string memory reason) {
            string memory target = "No available node";
            if (keccak256(bytes(reason)) != keccak256(bytes(target))) {
                revert(reason);
            }
        }
    }

    function submitTaskResultCommitment(
        uint256 taskId,
        uint round,
        bytes32 commitment,
        bytes32 nonce
    ) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].commitments[round] == 0, "Already submitted");
        require(!tasks[taskId].aborted, "Task is aborted");

        require(
            nonce != tasks[taskId].nonces[0] &&
                nonce != tasks[taskId].nonces[1] &&
                nonce != tasks[taskId].nonces[2],
            "Nonce already used"
        );

        tasks[taskId].commitments[round] = commitment;
        tasks[taskId].nonces[round] = nonce;
        tasks[taskId].commitmentSubmitRounds.push(round);

        if (isCommitmentReady(taskId)) {
            emit TaskResultCommitmentsReady(taskId);
        }
    }

    function isCommitmentReady(uint256 taskId) internal view returns (bool) {
        uint commitmentCount = 0;
        uint errCount = 0;
        for (uint i = 0; i < 3; i++) {
            bytes32 commitment = tasks[taskId].commitments[i];
            if (commitment != 0) {
                commitmentCount += 1;
                if (commitment == bytes32(uint256(1))) {
                    errCount += 1;
                }
            }
        }
        return commitmentCount == 3 && errCount < 2;
    }

    function discloseTaskResult(
        uint256 taskId,
        uint round,
        bytes calldata result
    ) public {
        require(result.length > 0, "Invalid result");
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].results[round].length == 0, "Already submitted");
        require(
            tasks[taskId].commitments[0] != 0 &&
                tasks[taskId].commitments[1] != 0 &&
                tasks[taskId].commitments[2] != 0,
            "Commitments not ready"
        );
        require(!tasks[taskId].aborted, "Task is aborted");

        require(
            tasks[taskId].commitments[round] ==
                keccak256(
                    abi.encodePacked(result, tasks[taskId].nonces[round])
                ),
            "Mismatch result and commitment"
        );

        // add task score for submit commitment
        uint submitIndex = 0;
        for (uint i = 0; i < 3; i++) {
            if (tasks[taskId].commitmentSubmitRounds[i] == round) {
                submitIndex = i;
                break;
            }
        }
        qos.addTaskScore(msg.sender, submitIndex);

        tasks[taskId].results[round] = result;
        qos.addTaskScore(
            msg.sender,
            tasks[taskId].resultDisclosedRounds.length
        );
        tasks[taskId].resultDisclosedRounds.push(round);

        checkTaskResult(taskId);
    }

    function tryDeleteTask(uint256 taskId) internal {
        // Delete task when all nodes were settled or slashed.
        require(tasks[taskId].id != 0, "Task not exist");

        for (uint i = 0; i < 3; i++) {
            if (nodeTasks[tasks[taskId].selectedNodes[i]] == taskId) {
                return;
            }
        }
        delete tasks[taskId];
        netStats.taskFinished();
    }

    function reportResultsUploaded(uint256 taskId, uint round) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].resultNode == msg.sender, "Not result round");
        require(!tasks[taskId].aborted, "Task is aborted");

        settleNodeByRound(taskId, round);
        tryDeleteTask(taskId);
        emit TaskResultUploaded(taskId);
    }

    function reportTaskError(uint256 taskId, uint round) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].commitments[round] == 0, "Already submitted");

        qos.addTaskScore(msg.sender, tasks[taskId].commitmentSubmitRounds.length);
        uint256 errCommitment = 1;
        tasks[taskId].commitments[round] = bytes32(errCommitment); // Set to a non-zero value to enter result committed state
        tasks[taskId].commitmentSubmitRounds.push(round);

        qos.addTaskScore(
            msg.sender,
            tasks[taskId].resultDisclosedRounds.length
        );
        tasks[taskId].resultDisclosedRounds.push(round); // Set to result disclosed state, the result is a special zero value

        if (isCommitmentReady(taskId)) {
            emit TaskResultCommitmentsReady(taskId);
        }

        checkTaskResult(taskId);
    }

    function cancelTask(uint256 taskId) public {
        if (tasks[taskId].id != 0) {
            // task is executing
            bool callerValid = false;
            if (msg.sender == tasks[taskId].creator) {
                callerValid = true;
            } else {
                for (uint i = 0; i < 3; i++) {
                    if (tasks[taskId].selectedNodes[i] == msg.sender) {
                        callerValid = true;
                        break;
                    }
                }
            }
            require(callerValid, "Unauthorized to cancel task");
            require(
                block.timestamp > tasks[taskId].timeout,
                "Task has not exceeded the deadline yet"
            );
            // return unuses task fee to task creator
            if (tasks[taskId].balance > 0) {
                uint token = tasks[taskId].balance;
                tasks[taskId].balance = 0;
                (bool success, ) = tasks[taskId].creator.call{value: token}("");
                require(success, "Token transfer failed");
            }

            if (tasks[taskId].commitmentSubmitRounds.length == 0) {
                // compensate task score when three nodes are all timeout and not submit commitments
                for (uint i = 0; i < 3; i++) {
                    address nodeAddress = tasks[taskId].selectedNodes[i];
                    // add task score for submit commitment and disclose task
                    qos.addTaskScore(nodeAddress, i);
                    qos.addTaskScore(nodeAddress, i);
                }
            } else if (tasks[taskId].commitmentSubmitRounds.length < 3) {
                // compensate task score for normal nodes when the task is blocked by other nodes
                for (uint i = 0; i < tasks[taskId].commitmentSubmitRounds.length; i++) {
                    uint round = tasks[taskId].commitmentSubmitRounds[i];
                    address nodeAddress = tasks[taskId].selectedNodes[round];
                    // add task score for submit commitment and disclose task
                    qos.addTaskScore(nodeAddress, i);
                    qos.addTaskScore(nodeAddress, i);
                }
            }

            if (!tasks[taskId].aborted) {
                emit TaskAborted(taskId, "Task Cancelled");
            }
            // free unfinished nodes and delete the task
            for (uint i = 0; i < 3; i++) {
                address nodeAddress = tasks[taskId].selectedNodes[i];
                // ensure current task of the node is the cancelled task
                if (nodeTasks[nodeAddress] == taskId) {
                    nodeTasks[nodeAddress] = 0;
                    node.finishTask(nodeAddress);
                    emit TaskNodeCancelled(taskId, nodeAddress);
                }
            }
            delete tasks[taskId];
            netStats.taskFinished();
        } else if (taskQueue.include(taskId)) {
            // task hasn't been executed
            TaskInQueue memory task = taskQueue.removeTask(taskId);
            (bool success, ) = task.creator.call{value: task.taskFee}("");
            require(success, "Token transfer failed");
            // stats task count in netstats
            netStats.taskStarted();
            netStats.taskFinished();
            emit TaskAborted(taskId, "Task Cancelled");
        } else {
            revert("Task not exist");
        }
    }

    function checkTaskResult(uint256 taskId) internal {
        if (tasks[taskId].resultDisclosedRounds.length == 2) {
            // If no node is cheating, we can already give the result back to the user.
            // And free the two honest nodes.
            tasks[taskId].isSuccess = compareRoundResult(taskId, 0, 1);
            if (tasks[taskId].isSuccess) {
                settleNodeByDiscloseIndex(taskId, 1);
                emitTaskFinishedEvent(taskId, 0);
            }
        } else if (tasks[taskId].resultDisclosedRounds.length == 3) {
            if (tasks[taskId].isSuccess) {
                // Task already succeeded. Check the result and finish the task
                if (compareRoundResult(taskId, 0, 2)) {
                    // no one is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                } else {
                    // 2 is cheating
                    punishNodeByDiscloseIndex(taskId, 2);
                }
            } else {
                if (compareRoundResult(taskId, 0, 2)) {
                    // 1 is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                    punishNodeByDiscloseIndex(taskId, 1);
                    emitTaskFinishedEvent(taskId, 0);
                } else if (compareRoundResult(taskId, 1, 2)) {
                    // 0 is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                    punishNodeByDiscloseIndex(taskId, 0);
                    emitTaskFinishedEvent(taskId, 1);
                } else {
                    // 3 different results...
                    // Let's just abort the task for now...
                    abortTask(taskId);
                }
            }

            tryDeleteTask(taskId);
        }
    }

    function emitTaskFinishedEvent(
        uint256 taskId,
        uint honestRoundIndex
    ) internal {
        uint honestRound = tasks[taskId].resultDisclosedRounds[
            honestRoundIndex
        ];
        if (tasks[taskId].results[honestRound].length > 0) {
            // Success task
            tasks[taskId].resultNode = tasks[taskId].selectedNodes[honestRound];

            numSuccessTasks++;
            emit TaskSuccess(
                taskId,
                tasks[taskId].results[honestRound],
                tasks[taskId].selectedNodes[honestRound]
            );
        } else {
            // Aborted task
            settleNodeByDiscloseIndex(taskId, honestRoundIndex);

            numAbortedTasks++;
            emit TaskAborted(taskId, "Task error reported");

            tasks[taskId].aborted = true;
            for (uint i = 0; i < 3; i++) {
                bytes32 commitment = tasks[taskId].commitments[i];
                if (commitment != 0 && commitment != bytes32(uint256(1))) {
                    punishNodeByRound(taskId, i);
                }
            }
            tryDeleteTask(taskId);
        }
    }

    function abortTask(uint256 taskId) internal {
        // Return the task fee to the user
        uint token = tasks[taskId].balance;
        tasks[taskId].balance = 0;
        (bool success, ) = tasks[taskId].creator.call{value: token}("");
        require(success, "Token transfer failed");

        // Free the nodes
        for (uint i = 0; i < 3; i++) {
            uint round = tasks[taskId].resultDisclosedRounds[i];
            address nodeAddress = tasks[taskId].selectedNodes[round];
            nodeTasks[nodeAddress] = 0;
            node.finishTask(nodeAddress);
            emit TaskNodeCancelled(taskId, nodeAddress);
        }

        numAbortedTasks++;
        emit TaskAborted(taskId, "Task result illegal");
        tasks[taskId].aborted = true;
    }

    function compareRoundResult(
        uint256 taskId,
        uint roundIndexA,
        uint roundIndexB
    ) internal view returns (bool) {
        uint taskType = tasks[taskId].taskType;
        uint roundA = tasks[taskId].resultDisclosedRounds[roundIndexA];
        uint roundB = tasks[taskId].resultDisclosedRounds[roundIndexB];

        bytes memory resultA = tasks[taskId].results[roundA];
        bytes memory resultB = tasks[taskId].results[roundB];

        if (taskType == TASK_TYPE_SD || taskType == TASK_TYPE_SD_FT) {
            return Hamming.compareHamming(resultA, resultB, distanceThreshold);
        } else if (taskType == TASK_TYPE_LLM) {
            return keccak256(resultA) == keccak256(resultB);
        } else {
            revert("Invalid task type");
        }
    }

    function settleNodeByRound(uint256 taskId, uint round) internal {
        address nodeAddress = tasks[taskId].selectedNodes[round];
        // Transfer task fee to the node
        uint fee = (tasks[taskId].totalBalance *
            qos.getCurrentTaskScore(nodeAddress)) / qos.getTaskScoreLimit();
        if (tasks[taskId].balance - fee < 3) {
            fee = tasks[taskId].balance;
        }
        tasks[taskId].balance -= fee;
        (bool success, ) = nodeAddress.call{value: fee}("");
        require(success, "Token transfer failed");

        // Free the node
        nodeTasks[nodeAddress] = 0;
        node.finishTask(nodeAddress);
        emit TaskNodeSuccess(taskId, nodeAddress, fee);
    }

    function settleNodeByDiscloseIndex(
        uint256 taskId,
        uint discloseIndex
    ) internal {
        settleNodeByRound(
            taskId,
            tasks[taskId].resultDisclosedRounds[discloseIndex]
        );
    }

    function punishNodeByRound(uint256 taskId, uint round) internal {
        address nodeAddress = tasks[taskId].selectedNodes[round];
        // Transfer task fee to the node
        uint fee = (tasks[taskId].totalBalance *
            qos.getCurrentTaskScore(nodeAddress)) / qos.getTaskScoreLimit();
        if (tasks[taskId].balance - fee < 3) {
            fee = tasks[taskId].balance;
        }
        tasks[taskId].balance -= fee;
        (bool success, ) = tasks[taskId].creator.call{value: fee}("");
        require(success, "Token transfer failed");

        // remove node's qos task score
        qos.punish(nodeAddress);

        // Free the node
        nodeTasks[nodeAddress] = 0;
        node.slash(nodeAddress);
        emit TaskNodeSlashed(taskId, nodeAddress);
    }

    function punishNodeByDiscloseIndex(
        uint256 taskId,
        uint discloseIndex
    ) internal {
        punishNodeByRound(
            taskId,
            tasks[taskId].resultDisclosedRounds[discloseIndex]
        );
    }

    function updateDistanceThreshold(uint threshold) public onlyOwner {
        distanceThreshold = threshold;
    }

    function updateTimeout(uint t) public onlyOwner {
        timeout = t;
    }

    function getTask(uint256 taskId) public view returns (TaskInfo memory) {
        return tasks[taskId];
    }

    function getNodeTask(address nodeAddress) public view returns (uint256) {
        return nodeTasks[nodeAddress];
    }

    function totalTasks() public view returns (uint256) {
        return nextTaskId - 1;
    }

    function totalSuccessTasks() public view returns (uint256) {
        return numSuccessTasks;
    }

    function totalAbortedTasks() public view returns (uint256) {
        return numAbortedTasks;
    }
}
