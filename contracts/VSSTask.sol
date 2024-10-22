// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";

contract VSSTask is Ownable {

    /* Events */

    event TaskCreated(
        bytes32 taskIDCommitment,
        uint samplingSeed
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

    /* Interfaces for applications */

    function createTask(
        bytes32 taskIDCommitment,
        bytes32 nonce,
        string calldata modelID,
        uint minimumVRAM,
        string calldata requiredGPU,
        uint taskFee,
        string calldata taskVersion
    ) payable public {}

    function validateSingleTask(
        bytes32 taskIDCommitment,
        uint samplingNumber,
        string calldata vrfProof
    ) public {}

    function validateTaskGroup(
        bytes32 taskIDCommitment1,
        bytes32 taskIDCommitment2,
        bytes32 taskIDCommitment3,
        bytes32 taskGUID,
        uint samplingNumber,
        string calldata vrfProof
    ) public {}

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
