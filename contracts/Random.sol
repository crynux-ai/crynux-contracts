// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/utils/math/Math.sol";


library Random {

    struct Generator {
        bytes32 seed;
        uint nonce;
    }

    function manualSeed(Generator storage self, bytes32 s) internal {
        self.seed = s;
    }

    function randint(Generator storage self) internal returns (uint) {
        uint res = uint(keccak256(abi.encodePacked(self.seed, self.nonce)));
        self.nonce++;
        return res;
    }

    function randrange(Generator storage self, uint start, uint end) internal returns (uint) {
        require(start < end, "range start should be less than end");
        uint rand = randint(self);
        return start + (rand % (end - start));
    }

    function average(uint a, uint b) private pure returns (uint) {
        return (a & b) + (a ^ b) / 2;
    }

    // Locate the insertion point for value in arr to maintain sorted order
    function binarySearch(uint[] memory arr, uint value) private pure returns (uint) {
        uint low = 0;
        uint high = arr.length;

        while (low < high) {
            uint mid = Math.average(low, high);

            if (arr[mid] < value) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return low;
    }

    function multinomial(Generator storage self, uint[] memory weights, uint start, uint end) internal returns (uint) {
        require(start < end, "multinomial start should be less than end");
        uint[] memory weightSum = new uint[](end - start + 1);
        weightSum[0] = 0;
        for (uint i = start; i < end; i++) {
            require(weights[i] > 0, "all multinomial weight should be greater than 0");
            weightSum[i - start + 1] = weights[i] + weightSum[i - start];
        }

        uint value = randrange(self, 1, weightSum[weightSum.length - 1] + 1);
        uint res = binarySearch(weightSum, value) - 1;
        return res + start;
    }
}