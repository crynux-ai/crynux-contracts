// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libs/VSS.sol";

contract VSSTask is Ownable {

    constructor() Ownable(msg.sender) {}

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

    struct TaskInfo {
        address creator;
        bytes32 taskIDCommitment;
        bytes32 samplingSeed;
        bytes32 nonce;
        TaskStatus status;
    }

    mapping(bytes32 => TaskInfo) private tasks;
    mapping(bytes32 => uint) private usedNonces;

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
        require(taskInfo.taskIDCommitment != 0, "Task not found");

        require(
            taskInfo.status == TaskStatus.ScoreReady
            || taskInfo.status == TaskStatus.ErrorReported,
            "Illegal task status");

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
        TaskInfo memory taskInfo = tasks[taskIDCommitment1];
        require(taskInfo.taskIDCommitment != 0, "Task not found");

        require(
            taskInfo.status == TaskStatus.ScoreReady
            || taskInfo.status == TaskStatus.ErrorReported,
            "Illegal task status");

        VSS.validateSamplingNumber(vrfProof, publicKey, taskInfo.creator, taskInfo.samplingSeed, true);
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
}
