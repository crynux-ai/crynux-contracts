// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "./VRF.sol";

library VSS {

    function generateSamplingSeed(bytes32 taskIDCommitment) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(blockhash(block.number - 1), taskIDCommitment)
        );
    }

    function validateSamplingNumber(
        uint256[4] calldata vrfProof,
        bytes calldata publicKey,
        address taskCreator,
        bytes32 samplingSeed,
        bool isSelected
    ) external view {

         // Check public key is consistent with the task creator & tx sender
        require(publicKey.length == 128, "Invalid public key");

        uint derivedAddress = uint(keccak256(publicKey)) & 0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

        require(derivedAddress == uint(uint160(msg.sender)), "Sender not allowed");
        require(derivedAddress == uint(uint160(taskCreator)), "Not task creator");

        // Extract point data from the public key
        uint256 pkX = uint256(bytes32(publicKey[0:64]));
        uint256 pkY = uint256(bytes32(publicKey[64:]));

        bytes memory samplingSeedBytes = bytes.concat(samplingSeed);

        // Validate VRF proof
        require(
            VRF.verify(
                [pkX, pkY],
                vrfProof,
                samplingSeedBytes
            ),
            "Invalid VRF proof");

        // Validate sampling number
        bytes32 samplingNumber = VRF.gammaToHash(vrfProof[0], vrfProof[1]);
        uint lastNum = uint(samplingNumber) % 10;

        if(isSelected) {
            require(lastNum == 0, "Task is not selected for validation");
        } else {
            require(lastNum != 0, "Task is selected for validation");
        }
    }
}