// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "truffle/Assert.sol";
import "../contracts/Hamming.sol";

contract TestHamming {
    function testHamming() public {
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

        res = Hamming.hamming(a, b, 0, 8);
        Assert.equal(res, 0, "Wrong hamming result");

        res = Hamming.hamming(a, b, 8, 16);
        Assert.equal(res, 8, "Wrong hamming result");
    }
}
