// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "vrf-solidity/contracts/VRF.sol";

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

        require(!usedNonces[nonce] || usedNonces[nonce] <= block.number - 100000, "Nonce is used");
        usedNonces[nonce] = block.number;

        TaskInfo memory taskInfo;
        taskInfo.creator = msg.sender;
        taskInfo.taskIDCommitment = taskIDCommitment;
        taskInfo.nonce = nonce;

        taskInfo.samplingSeed = keccak256(
            abi.encodePacked(blockhash(block.number - 1), taskIDCommitment)
        );

        tasks[taskIDCommitment] = taskInfo;

        emit TaskCreated(taskIDCommitment);
    }

    function validateSingleTask(
        bytes32 taskIDCommitment,
        uint256[4] calldata vrfProof,
        bytes calldata publicKey
    ) public {
        TaskInfo taskInfo = tasks[taskIDCommitment];
        require(taskInfo, "Task not found");

        require(
            taskInfo.status == TaskStatus.ScoreReady
            || taskInfo.status == TaskStatus.ErrorReported,
            "Illegal task status");

        validateSamplingNumber(vrfProof, publicKey, taskInfo.creator, taskInfo.samplingSeed, false);
    }

    function validateTaskGroup(
        bytes32 taskIDCommitment1,
        bytes32 taskIDCommitment2,
        bytes32 taskIDCommitment3,
        bytes32 taskGUID,
        uint256[4] calldata vrfProof,
        bytes calldata publicKey
    ) public {
        TaskInfo taskInfo = tasks[taskIDCommitment1];
        require(taskInfo, "Task not found");

        require(
            taskInfo.status == TaskStatus.ScoreReady
            || taskInfo.status == TaskStatus.ErrorReported,
            "Illegal task status");

        validateSamplingNumber(vrfProof, publicKey, taskInfo.creator, taskInfo.samplingSeed, true);
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

    /* VSS Helpers */

    function validateSamplingNumber(
        uint256[4] calldata vrfProof,
        bytes calldata publicKey,
        address taskCreator,
        bytes32 calldata samplingSeed,
        bool isSelected
    ) internal pure {

         // Check public key is consistent with the task creator & tx sender
        require(publicKey.length == 128, "Invalid public key");

        uint derivedAddress = uint(keccak256(publicKey)) & 0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

        require(derivedAddress == uint(msg.sender), "Sender not allowed");
        require(derivedAddress == uint(taskCreator), "Not task creator");

        // Extract point data from the public key
        uint256 pkX = uint256(bytes32(publicKey[0:64]));
        uint256 pkY = uint256(bytes32(publicKey[64:]));

        // Validate VRF proof
        require(
            VRF.verify(
                [pkX, pkY],
                vrfProof,
                samplingSeed
            ),
            "Invalid VRF proof");

        // Validate sampling number
        bytes samplingNumber = gammaToHash(vrfProof[0], vrfProof[1]);
        uint lastNum = uint(samplingNumber) % 10;

        if(isSelected) {
            require(lastNum == 0, "Task is not selected for validation");
        } else {
            require(lastNum != 0, "Task is selected for validation");
        }
    }

    function gammaToHash(uint256 _gammaX, uint256 _gammaY) internal pure returns (bytes32) {
        bytes memory c = abi.encodePacked(
          // Cipher suite code (SECP256K1-SHA256-TAI is 0xFE)
          uint8(0xFE),
          // 0x03
          uint8(0x03),
          // Compressed Gamma Point
          encodePoint(_gammaX, _gammaY));

        return sha256(c);
    }

    function encodePoint(uint256 _x, uint256 _y) internal pure returns (bytes memory) {
        uint8 prefix = uint8(2 + (_y % 2));
        return abi.encodePacked(prefix, _x);
    }
}
