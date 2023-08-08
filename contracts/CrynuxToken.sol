// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CrynuxToken is ERC20 {
    constructor() ERC20("Crynux", "CNX") {
        uint256 initialSupply = 4351443962 * 10 ** decimals();
        _mint(msg.sender, initialSupply);
    }
}
