// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "../Random.sol";


contract TestRandom {
    uint public intRes = 0;
    uint[] public arrRes;

    Random public random;

    constructor() {
        random = new Random();
    }

    function manualSeed(bytes32 s) public {
        random.manualSeed(s);
    }

    function getSeed() public view returns (bytes32) {
        return random.getSeed();
    }

    function getNonce() public view returns (uint) {
        return random.getNonce();
    }

    function randint() public  {
        intRes = random.randint();
    }

    function randrange(uint start, uint end) public {
        intRes = random.randrange(start, end);
    }

    function choice(uint[] memory weights) public {
        intRes = random.choice(weights);
    }

    function choices(uint[] memory weights, uint k) public {
        arrRes = random.choices(weights, k);
    }
}
