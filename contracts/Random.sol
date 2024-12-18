// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "./libs/Heap.sol";

contract Random {
    using Heap for Heap.MaxUintToUintKVHeap;

    struct Generator {
        bytes32 seed;
        uint nonce;
    }

    Generator private generator;
    Heap.MaxUintToUintKVHeap private maxHeap;


    function manualSeed(bytes32 s) public {
        generator.seed = s;
    }

    function _randint() internal returns (uint) {
        uint res = uint(keccak256(abi.encodePacked(generator.seed, generator.nonce)));
        generator.nonce++;
        return res;
    }

    function randint() public returns (uint) {
        return _randint();
    }

    function _randrange(uint start, uint end) internal returns (uint) {
        require(start < end, "range start should be less than end");
        uint rand = _randint();
        return start + (rand % (end - start));
    }

    function randrange(uint start, uint end) public returns (uint) {
        return _randrange(start, end);
    }

    // copyed from https://gist.github.com/k06a/af6c58fe6634e48e53929451877eb5b5
    function log_2_rand_0_1(uint256 x) public pure returns (uint256) {
        x &= 0xFFFFFFFFFFFFFFFF;
        require(x > 0);
        
        uint256 a = 63;
        while ((x >> a) == 0) {
            a--;
        }
        
        uint256 result = a - 64 << 64;
        uint256 ux = x << 127 - a;
        for (uint256 bit = 63; bit > 43; bit--) {
            ux *= ux;
            result |= ((ux >> 255) << bit);
            ux >>= 127 + (ux >> 255);
        }
        
        return uint256((-int256(result) * 1e18) >> 64);
    }

    function choice(uint[] memory weights) public returns (uint) {
        require(weights.length > 0);
        uint[] memory normWeights = new uint[](weights.length);
        for (uint i = 0; i < weights.length; i++) {
            normWeights[i] = log_2_rand_0_1(_randrange(1, 0x10000000000000000)) / weights[i];
        }

        uint res = 0;
        uint min = normWeights[0];
        for (uint i = 0; i < weights.length; i++) {
            if (normWeights[i] < min) {
                min = normWeights[i];
                res = i;
            }
        }
        return res;
    }

    function choices(uint[] memory weights, uint k) public returns (uint[] memory) {
        require(weights.length >= k);

        if (k == weights.length) {
            return weights;
        }

        uint[] memory results = new uint[](k);
        uint[] memory normWeights = new uint[](weights.length);
        for (uint i = 0; i < weights.length; i++) {
            normWeights[i] = log_2_rand_0_1(_randrange(1, 0x10000000000000000)) / weights[i];
        }

        if (k == 1) {
            uint res = 0;
            uint min = normWeights[0];
            for (uint i = 0; i < weights.length; i++) {
                if (normWeights[i] < min) {
                    min = normWeights[i];
                    res = i;
                }
            }
            results[0] = res;
            return results;
        }

        // find k indices with the smallest weight
        for (uint i = 0; i < k; i++) {
            maxHeap.push(i, normWeights[i]);
        }

        for (uint i = k; i < weights.length; i++) {
            (, uint weight) = maxHeap.top();
            if (normWeights[i] < weight) {
                maxHeap.pop();
                maxHeap.push(i, normWeights[i]);
            }
        }

        for (uint i = 0; i < k; i++) {
            (uint index, ) = maxHeap.pop();
            results[k - 1 - i] = index;
        }
        return results;
    }

}