// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "truffle/Assert.sol";
import "../contracts/Random.sol";


contract TestRandom {
    using Random for Random.Generator;

    Random.Generator private generator = Random.Generator(bytes32(uint(0)), 0);

    function testManualSeed() public {
        bytes32 seed = bytes32(uint(1));
        generator.manualSeed(seed);
        Assert.equal(generator.seed, seed, "Wrong generator seed");
        Assert.equal(generator.nonce, 0, "Wrong generator nonce");
    }

    function testRandint() public {
        uint res = generator.randint();
        Assert.isAtLeast(res, 0, "Wrong randint result");

        Assert.equal(generator.nonce, 1, "Wrong generator nonce");
    }

    function testRandrange() public {
        uint res = generator.randrange(0, 3);
        Assert.isAtLeast(res, 0, "Wrong randrange result");
        Assert.isBelow(res, 3, "Wrong randrange result");

        Assert.equal(generator.nonce, 2, "Wrong generator nonce");
    }

    function testMultinomial() public {
        uint[] memory weights = new uint[](3);
        weights[0] = 1;
        weights[1] = 2;
        weights[2] = 3;

        uint res = generator.multinomial(weights, 0, 3);
        Assert.isAtLeast(res, 0, "Wrong multinomial result");
        Assert.isBelow(res, 3, "Wrong multinomial result");

        Assert.equal(generator.nonce, 3, "Wrong generator nonce");
    }

    function wrongRandrange() public {
        generator.randrange(0, 0);
    }

    function testWrongRandrange() public {
        bool r;

        (r, ) = address(this).call(abi.encodePacked(this.wrongRandrange.selector));

        Assert.isFalse(r, "Randrange not fail as expected");
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
        bool r;

        (r, ) = address(this).call(abi.encodePacked(this.wrongMultinomial.selector));

        Assert.isFalse(r, "Multinomial not fail as expected");

        (r, ) = address(this).call(abi.encodePacked(this.wrongMultinomialWeights.selector));

        Assert.isFalse(r, "Multinomial not fail as expected");
    }
}