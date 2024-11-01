// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libs/VSS.sol";

contract VSSTask is Ownable {

    /* Events */
    event TaskQueued(
        bytes32 taskIDCommitment
    );

    event TaskStarted(
        bytes32 taskIDCommitment,
        address selectedNode
    );

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
        bytes32 taskScore
    );

    event TaskValidated(
        bytes32 taskIDCommitment
    );

    event TaskEndSuccess(
        bytes32 taskIDCommitment
    );

    event TaskEndInvalidated(
        bytes32 taskIDCommitment,
        address selectedNode
    );

    event TaskEndAborted(
        bytes32 taskIDCommitment,
        address abortIssuer,
        TaskStatus lastStatus,
        TaskAbortReason abortReason
    );

    /* States */
    enum TaskStatus {
        Queued,
        Started,
        ParametersUploaded,
        ErrorReported,
        ScoreReady,
        Validated,
        EndInvalidated,
        EndSuccess,
        EndAborted
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
        IncorrectResult
    }

    enum TaskError {
        ParametersValidationFailed
    }

    struct TaskInfo {
        address creator;
        bytes32 taskIDCommitment;
        bytes32 samplingSeed;
        bytes32 nonce;
        uint256 sequence;
        TaskStatus status;
        address selectedNode;
        uint256 timeout;
        bytes32 score;
        TaskAbortReason abortReason;
        TaskError error;
    }

    mapping(bytes32 => TaskInfo) private tasks;
    mapping(bytes32 => uint) private usedNonces;
    uint256 private nextSequence;
    address private relayAddress;
    uint256 private timeout;

    constructor() Ownable(msg.sender) {
        nextSequence = 1;
        timeout = 3 minutes;
    }

    /* Interfaces for owner */
    function setRelayAddress(address addr) external onlyOwner {
        relayAddress = addr;
    }

    /* Interfaces for applications */

    function createTask(
        bytes32 taskIDCommitment,
        bytes32 nonce,
        string calldata modelID,
        uint minimumVRAM,
        string calldata requiredGPU,
        uint taskFee,
        string calldata taskVersion
    ) payable public {

        require(taskFee > 0, "Task fee cannot be 0");

        require(usedNonces[nonce] == 0 || usedNonces[nonce] <= block.number - 100000, "Nonce is used");
        usedNonces[nonce] = block.number;

        TaskInfo memory taskInfo;
        taskInfo.creator = msg.sender;
        taskInfo.taskIDCommitment = taskIDCommitment;
        taskInfo.nonce = nonce;
        taskInfo.timeout = block.timestamp + timeout;

        taskInfo.sequence = nextSequence;
        nextSequence += 1;

        taskInfo.samplingSeed = VSS.generateSamplingSeed(taskIDCommitment);

        tasks[taskIDCommitment] = taskInfo;

        //TODO: Queue or start the task.
    }

    function validateSingleTask(
        bytes32 taskIDCommitment,
        bytes calldata vrfProof,
        bytes calldata publicKey
    ) public {
        TaskInfo memory taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(taskInfo, TaskStateTransition.ValidateSingleTask);

        // Sampling Number validation
        VSS.validateSamplingNumber(vrfProof, publicKey, taskInfo.creator, taskInfo.samplingSeed, false);

        if (taskInfo.status == TaskStatus.ErrorReported) {
            changeTaskState(taskInfo, TaskStatus.EndAborted);
        } else if (taskInfo.status == TaskStatus.ScoreReady) {
            changeTaskState(taskInfo, TaskStatus.Validated);
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
        TaskInfo memory taskInfo1 = tasks[taskIDCommitment1];
        TaskInfo memory taskInfo2 = tasks[taskIDCommitment2];
        TaskInfo memory taskInfo3 = tasks[taskIDCommitment3];

        checkStateTransitionAllowance(taskInfo1, TaskStateTransition.ValidateTaskGroup);
        checkStateTransitionAllowance(taskInfo2, TaskStateTransition.ValidateTaskGroup);
        checkStateTransitionAllowance(taskInfo3, TaskStateTransition.ValidateTaskGroup);

        require(taskInfo1.sequence < taskInfo2.sequence, "Invalid task sequence");
        require(taskInfo1.sequence < taskInfo3.sequence, "Invalid task sequence");

        // Sampling Number validation
        VSS.validateSamplingNumber(vrfProof, publicKey, taskInfo1.creator, taskInfo1.samplingSeed, true);

        // Task relationship validation
        VSS.validateGUID(taskGUID, taskIDCommitment1, taskInfo1.nonce);
        VSS.validateGUID(taskGUID, taskIDCommitment2, taskInfo2.nonce);
        VSS.validateGUID(taskGUID, taskIDCommitment3, taskInfo3.nonce);

        // Task parameters validation
        // already performed by the Relay before DA is used.

        // Task result validation

    }

    /* Interfaces for nodes */

    function reportTaskError(
        bytes32 taskIDCommitment,
        TaskError error
    ) public {
        TaskInfo memory taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(taskInfo, TaskStateTransition.ReportTaskError);

        taskInfo.error = error;

        changeTaskState(taskInfo, TaskStatus.ErrorReported);
    }

    function submitTaskScore(
        bytes32 taskIDCommitment,
        bytes32 taskScore
    ) public {
        TaskInfo memory taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(taskInfo, TaskStateTransition.SubmitTaskScore);

        require(taskScore != 0, "Invalid task score");

        taskInfo.score = taskScore;

        changeTaskState(taskInfo, TaskStatus.ScoreReady);
    }

    /* Interfaces for both applications and nodes */

    function abortTask(
        bytes32 taskIDCommitment,
        TaskAbortReason abortReason
    ) public {
        TaskInfo memory taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(taskInfo, TaskStateTransition.AbortTask);

        taskInfo.abortReason = abortReason;

        changeTaskState(taskInfo, TaskStatus.EndAborted);
    }

    /* Interfaces for Relay */

    function reportTaskParametersUploaded(
        bytes32 taskIDCommitment
    ) public {
        TaskInfo memory taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(taskInfo, TaskStateTransition.ReportTaskParametersUploaded);

        changeTaskState(taskInfo, TaskStatus.ParametersUploaded);
    }

    function reportTaskResultUploaded(
        bytes32 taskIDCommitment
    ) public {
        TaskInfo memory taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(taskInfo, TaskStateTransition.ReportTaskResultUploaded);

        changeTaskState(taskInfo, TaskStatus.EndSuccess);
    }

    /* State Transition */
    function checkStateTransitionAllowance(
        TaskInfo calldata taskInfo,
        TaskStateTransition transition
    ) private {
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
                taskInfo.status == TaskStatus.ScoreReady
                || taskInfo.status == TaskStatus.ErrorReported,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.ValidateTaskGroup) {

            require(msg.sender == taskInfo.creator, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ScoreReady
                || taskInfo.status == TaskStatus.ErrorReported
                || taskInfo.status == TaskStatus.EndAborted,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.ReportTaskResultUploaded) {

            require(msg.sender == relayAddress, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.Validated,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.AbortTask) {

            require(
                msg.sender == taskInfo.creator
                || msg.sender == taskInfo.selectedNode,
                "Invalid caller"
            );

            require(block.timestamp > taskInfo.timeout, "Timeout not reached");
        }
    }

    function changeTaskState(TaskInfo calldata taskInfo, TaskStatus status) private {

        TaskStatus lastStatus = taskInfo.status;
        taskInfo.status = status;

        if(status == TaskStatus.ParametersUploaded) {

            emit(TaskParametersUploaded(taskInfo.taskIDCommitment, taskInfo.selectedNode));

        } else if(status == TaskStatus.ScoreReady) {

            emit(TaskScoreReady(taskInfo.taskIDCommitment, taskInfo.selectedNode, taskInfo.score));

        } else if(status == TaskStatus.ErrorReported) {

            emit(TaskErrorReported(taskInfo.taskIDCommitment, taskInfo.selectedNode, taskInfo.error));

        } else if(status == TaskStatus.Validated) {

            emit(TaskValidated(taskInfo.taskIDCommitment));

        } else if(status == TaskStatus.EndSuccess) {

            //TODO: release node
            //TODO: settle task fee
            emit(TaskEndSuccess(taskInfo.taskIDCommitment));

        } else if(status == TaskStatus.EndAborted) {

            //TODO: release node
            //TODO: refund task fee
            emit(TaskEndAborted(taskInfo.taskIDCommitment, msg.sender, lastStatus, taskInfo.abortReason));
        } else if(status == TaskStatus.EndInvalidated) {

            //TODO: slash node
            //TODO: refund task fee
            emit(TaskEndInvalidated(taskInfo.taskIDCommitment, taskInfo.selectedNode));
        }
    }
}
