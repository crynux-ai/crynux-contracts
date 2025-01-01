// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "./libs/Heap.sol";
import { SD59x18, sd, intoUint256 } from "@prb/math/src/SD59x18.sol";


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

    function getSeed() public view returns (bytes32) {
        return generator.seed;
    }

    function getNonce() public view returns (uint) {
        return generator.nonce;
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

    function choice(uint[] memory weights) public returns (uint) {
        require(weights.length > 0, "Weights length is 0");
        uint[] memory normWeights = new uint[](weights.length);
        for (uint i = 0; i < weights.length; i++) {
            // 18 fixed point number, (0, 1e18) => (0, 1)
            SD59x18 r = sd(int256(_randrange(1, 1e18)));
            SD59x18 log2 = -r.log2();
            normWeights[i] = intoUint256(log2) / weights[i];
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
        require(weights.length >= k, "Weights length is less than k");

        if (k == weights.length) {
            return weights;
        }

        uint[] memory results = new uint[](k);
        uint[] memory normWeights = new uint[](weights.length);
        for (uint i = 0; i < weights.length; i++) {
            SD59x18 r = sd(int256(_randrange(1, 1e18)));
            SD59x18 log2 = -r.log2();
            normWeights[i] = intoUint256(log2) / weights[i];
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