// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "../Hamming.sol";

contract TestHamming {
    function testHamming() public view returns (uint, uint) {
        bytes memory a = new bytes(16);
        bytes memory b = new bytes(16);

        for (uint8 i = 0; i < uint8(16); i++) {
            a[uint(i)] = bytes1(i);
            if (i < uint8(8)) {
                b[uint(i)] = bytes1(i);
            } else {
                b[uint(i)] = bytes1(i ^ 1);
            }
        }

        uint res;

        return (Hamming.hamming(a, b, 0, 8), Hamming.hamming(a, b, 8, 16));
    }
}
