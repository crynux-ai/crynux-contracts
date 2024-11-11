// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "../libs/VSS.sol";

contract TestVSS  {
    function getSamplingSeed(bytes32 taskIDCommitment) external view returns (bytes32) {
        return VSS.generateSamplingSeed(taskIDCommitment);
    }

    function validateSamplingNumber(
        bytes calldata vrfProof,
        bytes calldata publicKey,
        address taskCreator,
        bytes32 samplingSeed,
        bool isSelected
    ) external pure returns (bool) {

        VSS.validateSamplingNumber(
            vrfProof,
            publicKey,
            taskCreator,
            samplingSeed,
            isSelected
        );

        return true;
    }
}