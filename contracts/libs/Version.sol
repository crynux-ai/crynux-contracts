// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

library Version {
    function matchVersion(uint[3] memory nodeVersion, uint[3] memory taskVersion) internal pure returns (bool) {
        // major version of node and task should be the same
        // node minor version should be larger equal than task minor version
        if (nodeVersion[0] != taskVersion[0]) {
            return false;
        }
        if (nodeVersion[1] == taskVersion[1]) {
            return nodeVersion[2] >= taskVersion[2];
        }
        return nodeVersion[1] > taskVersion[1];
    }
}