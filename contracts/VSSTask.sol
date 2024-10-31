// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libs/VSS.sol";

contract VSSTask is Ownable {

    /* Events */

    event TaskCreated(
        bytes32 taskIDCommitment,
        bytes32 samplingSeed
    );

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
        string errorMessage
    );

    event TaskAborted(
        bytes32 taskIDCommitment,
        address abortIssuer,
        string abortReason
    );

    event TaskScoreReady(
        bytes32 taskIDCommitment,
        bytes32 taskScore
    );

    event TaskValidated(
        bytes32 taskIDCommitment
    );

    event TaskSuccess(
        bytes32 taskIDCommitment
    );

    /* States */
    enum TaskStatus {
        Queued,
        Started,
        ParametersUploaded,
        ErrorReported,
        Aborted,
        ScoreReady,
        Validated,
        Success
    }

    enum TaskStateTransition {
        reportTaskParametersUploaded,
        submitTaskScore,
        reportTaskError,
        validateSingleTask,
        validateTaskGroup,
        reportTaskResultUploaded,
        abortTask
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

        emit TaskCreated(taskIDCommitment, taskInfo.samplingSeed);
    }

    function validateSingleTask(
        bytes32 taskIDCommitment,
        bytes calldata vrfProof,
        bytes calldata publicKey
    ) public {
        TaskInfo memory taskInfo = tasks[taskIDCommitment];
        checkStateTransitionAllowance(taskInfo, TaskStateTransition.validateSingleTask);

        VSS.validateSamplingNumber(vrfProof, publicKey, taskInfo.creator, taskInfo.samplingSeed, false);
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

        checkStateTransitionAllowance(taskInfo1, TaskStateTransition.validateTaskGroup);
        checkStateTransitionAllowance(taskInfo2, TaskStateTransition.validateTaskGroup);
        checkStateTransitionAllowance(taskInfo3, TaskStateTransition.validateTaskGroup);

        require(taskInfo1.sequence < taskInfo2.sequence, "Invalid task sequence");
        require(taskInfo1.sequence < taskInfo3.sequence, "Invalid task sequence");

        VSS.validateSamplingNumber(vrfProof, publicKey, taskInfo1.creator, taskInfo1.samplingSeed, true);
    }

    /* Interfaces for nodes */

    function reportTaskError(
        bytes32 taskIDCommitment,
        string calldata errorMessage
    ) public {}

    function submitTaskScore(
        bytes32 taskIDCommitment,
        bytes32 taskScore
    ) public {}

    /* Interfaces for both applications and nodes */

    function abortTask(
        bytes32 taskIDCommitment,
        string calldata abortReason
    ) public {}

    /* Interfaces for Relay */

    function reportTaskParametersUploaded(
        bytes32 taskIDCommitment
    ) public {}

    function reportTaskResultUploaded(
        bytes32 taskIDCommitment
    ) public {}

    /* State Transition */
    function checkStateTransitionAllowance(
        TaskInfo calldata taskInfo,
        TaskStateTransition transition
    ) private {
        require(taskInfo.taskIDCommitment != 0, "Task not found");

        if (transition == TaskStateTransition.reportTaskParametersUploaded) {

            require(msg.sender == relayAddress, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.Started,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.submitTaskScore) {

            require(msg.sender == taskInfo.selectedNode, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ParametersUploaded,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.reportTaskError) {

            require(msg.sender == taskInfo.selectedNode, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ParametersUploaded,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.validateSingleTask) {

            require(msg.sender == taskInfo.selectedNode, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ScoreReady
                || taskInfo.status == TaskStatus.ErrorReported,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.validateTaskGroup) {

            require(msg.sender == taskInfo.selectedNode, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.ScoreReady
                || taskInfo.status == TaskStatus.ErrorReported
                || taskInfo.status == TaskStatus.Aborted,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.reportTaskResultUploaded) {

            require(msg.sender == relayAddress, "Invalid caller");

            require(
                taskInfo.status == TaskStatus.Validated,
                "Illegal previous task state"
            );

        } else if (transition == TaskStateTransition.abortTask) {

            require(
                msg.sender == taskInfo.creator
                || msg.sender == taskInfo.selectedNode,
                "Invalid caller"
            );

            require(block.timestamp > taskInfo.timeout, "Timeout not reached");
        }
    }
}
