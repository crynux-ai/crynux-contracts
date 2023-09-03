// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Node is Ownable {
    using EnumerableMap for EnumerableMap.AddressToUintMap;

    uint256 private maxNodesAllowed = 100000;
    uint256 private requiredStakeAmount = 400 * 10 ** 18;

    // Node status
    uint private NODE_STATUS_QUIT = 0;
    uint private NODE_STATUS_AVAILABLE = 1;
    uint private NODE_STATUS_BUSY = 2;
    uint private NODE_STATUS_PENDING_PAUSE = 3;
    uint private NODE_STATUS_PENDING_QUIT = 4;
    uint private NODE_STATUS_PAUSED = 5;

    IERC20 private cnxToken;

    EnumerableMap.AddressToUintMap private nodeMap;
    uint256 private numAvailableNodes = 0;

    address private taskContractAddress;

    constructor(IERC20 tokenInstance) {
        cnxToken = tokenInstance;
    }

    function join() public {
        require(totalNodes() < maxNodesAllowed, "Network is full");
        require(getNodeStatus(msg.sender) == NODE_STATUS_QUIT, "Node already joined");

        // Check the staking
        require(
            cnxToken.allowance(
                msg.sender,
                address(this)
            ) >= requiredStakeAmount, "Not enough allowance to stake");

        require(
            cnxToken.balanceOf(msg.sender) >= requiredStakeAmount,
            "Not enough token to stake"
        );

        // Transfer the tokens
        require(
            cnxToken.transferFrom(msg.sender, address(this), requiredStakeAmount),
            "Token transfer failed"
        );

        // Add to node list
        nodeMap.set(msg.sender, NODE_STATUS_AVAILABLE);
        numAvailableNodes++;
    }

    function quit() public {
        uint nodeStatus = getNodeStatus(msg.sender);

        if (nodeStatus == NODE_STATUS_AVAILABLE || nodeStatus == NODE_STATUS_PAUSED) {
            // Remove the node from the list
            nodeMap.remove(msg.sender);

            if (nodeStatus == NODE_STATUS_AVAILABLE) {
                numAvailableNodes--;
            }

            // Return the staked tokens
            require(
                cnxToken.transfer(msg.sender, requiredStakeAmount),
                "Token transfer failed"
            );
        } else if (nodeStatus == NODE_STATUS_BUSY) {
            nodeMap.set(msg.sender, NODE_STATUS_PENDING_QUIT);
        } else {
            revert("Illegal node status");
        }
    }

    function pause() public {
        uint nodeStatus = getNodeStatus(msg.sender);

        if (nodeStatus == NODE_STATUS_AVAILABLE) {
            nodeMap.set(msg.sender, NODE_STATUS_PAUSED);
            numAvailableNodes--;
        } else if (nodeStatus == NODE_STATUS_BUSY) {
            nodeMap.set(msg.sender, NODE_STATUS_PENDING_PAUSE);
        } else {
            revert("Illegal node status");
        }
    }

    function resume() public {
        require(getNodeStatus(msg.sender) == NODE_STATUS_PAUSED, "Illegal node status");
        nodeMap.set(msg.sender, NODE_STATUS_AVAILABLE);
        numAvailableNodes++;
    }

    function slash(address nodeAddress) public {
        require(msg.sender == taskContractAddress, "Not called by the task contract");

        uint nodeStatus = getNodeStatus(nodeAddress);
        require(
            nodeStatus == NODE_STATUS_BUSY
            || nodeStatus == NODE_STATUS_PENDING_PAUSE
            || nodeStatus == NODE_STATUS_PENDING_QUIT,
            "Illegal node status"
        );

        // Transfer the staked tokens to the root
        require(
            cnxToken.transfer(owner(), requiredStakeAmount),
            "Token transfer failed"
        );

        // Remove the node from the list
        nodeMap.remove(nodeAddress);
    }

    function totalNodes() public view returns (uint256) {
        return nodeMap.length();
    }

    function availableNodes() public view returns (uint256) {
        return numAvailableNodes;
    }

    function startTask(address nodeAddress) public {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(getNodeStatus(nodeAddress) == NODE_STATUS_AVAILABLE, "Node is not available");
        nodeMap.set(nodeAddress, NODE_STATUS_BUSY);
        numAvailableNodes--;
    }

    function finishTask(address nodeAddress) public {
        require(msg.sender == taskContractAddress, "Not called by the task contract");

        uint nodeStatus = getNodeStatus(nodeAddress);
        require(
            nodeStatus == NODE_STATUS_BUSY
            || nodeStatus == NODE_STATUS_PENDING_PAUSE
            || nodeStatus == NODE_STATUS_PENDING_QUIT
            , "Illegal node status");

        if (nodeStatus == NODE_STATUS_BUSY) {
            nodeMap.set(nodeAddress, NODE_STATUS_AVAILABLE);
            numAvailableNodes++;
        } else if (nodeStatus == NODE_STATUS_PENDING_QUIT) {
            // Remove the node from the list
            nodeMap.remove(nodeAddress);

            // Return the staked tokens
            require(
                cnxToken.transfer(nodeAddress, requiredStakeAmount),
                "Token transfer failed"
            );
        } else if (nodeStatus == NODE_STATUS_PENDING_PAUSE) {
            nodeMap.set(nodeAddress, NODE_STATUS_PAUSED);
        }
    }

    function getAvailableNodeStartsFrom(uint256 i) public view returns (address) {

        address nodeAddress;
        uint nodeStatus;
        uint256 total = totalNodes();
        uint256 stop = i;

        if (total == 0 || i >= total) revert("Illegal index given");

        do {
            (nodeAddress, nodeStatus) = nodeMap.at(i);

            if(nodeStatus == NODE_STATUS_AVAILABLE) {
                return nodeAddress;
            }

            i = (i + 1) % total;

        } while (i != stop);

        revert("Not found");
    }

    function updateTaskContractAddress(address taskContract) public onlyOwner {
        taskContractAddress = taskContract;
    }

    function getNodeStatus(address nodeAddress) public view returns (uint) {
        if (nodeMap.contains(nodeAddress)) {
            return nodeMap.get(nodeAddress);
        } else {
            return NODE_STATUS_QUIT;
        }
    }
}
