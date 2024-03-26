// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "../Random.sol";


contract TestRandom {
    using Random for Random.Generator;

    Random.Generator public generator = Random.Generator(bytes32(uint(0)), 0);
    uint public intRes = 0;
    bool public boolRes;

    function testManualSeed(uint value) public {
        bytes32 seed = bytes32(value);
        generator.manualSeed(seed);
    }

    function testRandint() public  {
        intRes = generator.randint();
    }

    function testRandrange() public {
        intRes = generator.randrange(0, 3);
    }

    function testMultinomial() public {
        uint[] memory weights = new uint[](3);
        weights[0] = 1;
        weights[1] = 2;
        weights[2] = 3;
        intRes = generator.multinomial(weights, 0, 3);
    }

    function wrongRandrange() public {
        generator.randrange(0, 0);
    }

    function testWrongRandrange() public {
        (boolRes, ) = address(this).call(abi.encodePacked(this.wrongRandrange.selector));
    }

    function wrongMultinomial() public {
        uint[] memory weights = new uint[](3);
        weights[0] = 1;
        weights[1] = 2;
        weights[2] = 3;

        generator.multinomial(weights, 0, 0);
    }

    function wrongMultinomialWeights() public {
        uint[] memory weights = new uint[](3);
        weights[0] = 0;
        weights[1] = 2;
        weights[2] = 3;

        generator.multinomial(weights, 0, 3);
    }

    function testWrongMultinomial() public {
        (boolRes, ) = address(this).call(abi.encodePacked(this.wrongMultinomial.selector));
    }

    function testWrongMultinomialWeights() public {
        (boolRes, ) = address(this).call(abi.encodePacked(this.wrongMultinomialWeights.selector));
    }
}
