// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./QOS.sol";

contract Node is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableMap for EnumerableMap.Bytes32ToUintMap;

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
    QOS private qos;

    struct GPUInfo {
        string name;
        uint vram;
    }

    struct NodeInfo {
        uint status;
        bytes32 gpuID;
        GPUInfo gpu;
        uint score;
    }

    // store all nodes info
    EnumerableSet.AddressSet private allNodes;
    mapping(address => NodeInfo) private nodesMap;

    // store all available nodes;
    EnumerableSet.AddressSet private _availableNodes;
    // store available nodes indexed by gpu vram
    EnumerableSet.UintSet private _availableGPUVramSet;
    mapping(uint => EnumerableSet.AddressSet) private _gpuVramNodesIndex;
    mapping(uint => uint) private _gpuVramGroupScores;
    // store available nodes indexed by gpu type (gpuID)
    EnumerableMap.Bytes32ToUintMap private _availableGPUIDVramMap;
    mapping(bytes32 => EnumerableSet.AddressSet) private _gpuIDNodesIndex;
    mapping(bytes32 => uint) private _gpuIDGroupScores;

    address private taskContractAddress;

    constructor(IERC20 tokenInstance, QOS qosInstance) {
        cnxToken = tokenInstance;
        qos = qosInstance;
    }

    function getNodeInfo(
        address nodeAddress
    ) public view returns (NodeInfo memory) {
        return nodesMap[nodeAddress];
    }

    function totalNodes() public view returns (uint) {
        return allNodes.length();
    }

    function availableNodes() public view returns (uint) {
        return _availableNodes.length();
    }

    function getAllNodeAddresses() public view returns (address[] memory) {
        return allNodes.values();
    }

    function getAvailableGPUs() public view returns (GPUInfo[] memory) {
        uint length = _availableGPUIDVramMap.length();
        GPUInfo[] memory res = new GPUInfo[](length);
        for (uint i = 0; i < length; i++) {
            (bytes32 gpuID, ) = _availableGPUIDVramMap.at(i);
            address nodeAddress = _gpuIDNodesIndex[gpuID].at(0);
            res[i] = nodesMap[nodeAddress].gpu;
        }
        return res;
    }

    function getAvailableNodes() public view returns (address[] memory) {
        return _availableNodes.values();
    }

    function getNodeStatus(address nodeAddress) public view returns (uint) {
        return nodesMap[nodeAddress].status;
    }

    function setNodeStatus(address nodeAddress, uint status) private {
        nodesMap[nodeAddress].status = status;
    }

    function markNodeAvailable(address nodeAddress) private {
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;
        uint score = nodesMap[nodeAddress].score;

        // index node by gpu memory
        _availableGPUVramSet.add(vram);
        _gpuVramNodesIndex[vram].add(nodeAddress);
        _gpuVramGroupScores[vram] += score;

        // index node by gpu ID
        _availableGPUIDVramMap.set(gpuID, vram);
        _gpuIDNodesIndex[gpuID].add(nodeAddress);
        _gpuIDGroupScores[gpuID] += score;

        // add node to available nodes set
        _availableNodes.add(nodeAddress);
    }

    function markNodeUnavailable(address nodeAddress) private {
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;
        uint score = nodesMap[nodeAddress].score;

        // remove node from gpu index
        _gpuVramNodesIndex[vram].remove(nodeAddress);
        _gpuVramGroupScores[vram] -= score;
        if (_gpuVramNodesIndex[vram].length() == 0) {
            _availableGPUVramSet.remove(vram);
        }

        // remove node from gpu id index
        _gpuIDNodesIndex[gpuID].remove(nodeAddress);
        _gpuIDGroupScores[gpuID] -= score;
        if (_gpuIDNodesIndex[gpuID].length() == 0) {
            _availableGPUIDVramMap.remove(gpuID);
        }

        // remove node from available nodes set
        _availableNodes.remove(nodeAddress);
    }

    function removeNode(address nodeAddress) private {
        delete nodesMap[nodeAddress];
        allNodes.remove(nodeAddress);
    }

    function join(string calldata gpuName, uint gpuVram) public {
        require(allNodes.length() < maxNodesAllowed, "Network is full");
        require(
            getNodeStatus(msg.sender) == NODE_STATUS_QUIT,
            "Node already joined"
        );

        // Check the staking
        require(
            cnxToken.allowance(msg.sender, address(this)) >=
                requiredStakeAmount,
            "Not enough allowance to stake"
        );

        require(
            cnxToken.balanceOf(msg.sender) >= requiredStakeAmount,
            "Not enough token to stake"
        );

        // Transfer the tokens
        require(
            cnxToken.transferFrom(
                msg.sender,
                address(this),
                requiredStakeAmount
            ),
            "Token transfer failed"
        );

        // add nodes to nodesMap
        bytes32 gpuID = keccak256(abi.encodePacked(gpuName, gpuVram));
        uint score = qos.getTaskScore(msg.sender);
        nodesMap[msg.sender] = NodeInfo(
            NODE_STATUS_AVAILABLE,
            gpuID,
            GPUInfo(gpuName, gpuVram),
            score
        );
        allNodes.add(msg.sender);

        markNodeAvailable(msg.sender);
    }

    function quit() public {
        uint nodeStatus = getNodeStatus(msg.sender);

        if (
            nodeStatus == NODE_STATUS_AVAILABLE ||
            nodeStatus == NODE_STATUS_PAUSED
        ) {
            // Remove the node from the list
            if (nodeStatus == NODE_STATUS_AVAILABLE) {
                markNodeUnavailable(msg.sender);
            }

            removeNode(msg.sender);

            // Return the staked tokens
            require(
                cnxToken.transfer(msg.sender, requiredStakeAmount),
                "Token transfer failed"
            );
        } else if (nodeStatus == NODE_STATUS_BUSY) {
            setNodeStatus(msg.sender, NODE_STATUS_PENDING_QUIT);
        } else {
            revert("Illegal node status");
        }
    }

    function pause() public {
        uint nodeStatus = getNodeStatus(msg.sender);

        if (nodeStatus == NODE_STATUS_AVAILABLE) {
            setNodeStatus(msg.sender, NODE_STATUS_PAUSED);
            markNodeUnavailable(msg.sender);
        } else if (nodeStatus == NODE_STATUS_BUSY) {
            setNodeStatus(msg.sender, NODE_STATUS_PENDING_PAUSE);
        } else {
            revert("Illegal node status");
        }
    }

    function resume() public {
        require(
            getNodeStatus(msg.sender) == NODE_STATUS_PAUSED,
            "Illegal node status"
        );
        setNodeStatus(msg.sender, NODE_STATUS_AVAILABLE);
        markNodeAvailable(msg.sender);
    }

    function slash(address nodeAddress) public {
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        uint nodeStatus = getNodeStatus(nodeAddress);
        require(
            nodeStatus == NODE_STATUS_BUSY ||
                nodeStatus == NODE_STATUS_PENDING_PAUSE ||
                nodeStatus == NODE_STATUS_PENDING_QUIT,
            "Illegal node status"
        );

        // Transfer the staked tokens to the root
        require(
            cnxToken.transfer(owner(), requiredStakeAmount),
            "Token transfer failed"
        );

        qos.finishTask(nodeAddress);
        // Remove the node from the list
        markNodeUnavailable(nodeAddress);
        removeNode(nodeAddress);
    }

    function startTask(address nodeAddress) public {
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );
        require(
            getNodeStatus(nodeAddress) == NODE_STATUS_AVAILABLE,
            "Node is not available"
        );
        markNodeUnavailable(nodeAddress);
        setNodeStatus(nodeAddress, NODE_STATUS_BUSY);
        qos.startTask(nodeAddress);
    }

    function finishTask(address nodeAddress) public {
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        uint nodeStatus = getNodeStatus(nodeAddress);
        require(
            nodeStatus == NODE_STATUS_BUSY ||
                nodeStatus == NODE_STATUS_PENDING_PAUSE ||
                nodeStatus == NODE_STATUS_PENDING_QUIT,
            "Illegal node status"
        );

        qos.finishTask(nodeAddress);
        if (qos.shouldKickOut(nodeAddress)) {
            removeNode(nodeAddress);
            require(
                cnxToken.transfer(nodeAddress, requiredStakeAmount),
                "Token transfer failed"
            );
            return;
        }
        // update node qos score
        nodesMap[nodeAddress].score = qos.getTaskScore(nodeAddress);

        if (nodeStatus == NODE_STATUS_BUSY) {
            markNodeAvailable(nodeAddress);
            setNodeStatus(nodeAddress, NODE_STATUS_AVAILABLE);
        } else if (nodeStatus == NODE_STATUS_PENDING_QUIT) {
            // Remove the node from the list
            removeNode(nodeAddress);

            // Return the staked tokens
            require(
                cnxToken.transfer(nodeAddress, requiredStakeAmount),
                "Token transfer failed"
            );
        } else if (nodeStatus == NODE_STATUS_PENDING_PAUSE) {
            setNodeStatus(nodeAddress, NODE_STATUS_PAUSED);
        }
    }

    function updateTaskContractAddress(address taskContract) public onlyOwner {
        taskContractAddress = taskContract;
    }

    function filterGPUVram(
        uint vramLimit,
        uint countLimit
    ) public view returns (uint[] memory, uint[] memory) {
        uint[] memory scores = new uint[](_availableGPUVramSet.length());
        uint[] memory memories = new uint[](_availableGPUVramSet.length());
        uint validCount = 0;

        // filter all valid gpu memory
        for (uint i = 0; i < _availableGPUVramSet.length(); i++) {
            uint gpuMemory = _availableGPUVramSet.at(i);
            if (gpuMemory >= vramLimit) {
                uint count = _gpuVramNodesIndex[gpuMemory].length();
                if (count >= countLimit) {
                    scores[validCount] = _gpuVramGroupScores[gpuMemory];
                    memories[validCount] = gpuMemory;
                    validCount++;
                }
            }
        }
        require(validCount > 0, "No available node");

        // resize array by assembly
        uint subSize = scores.length - validCount;
        assembly {
            mstore(memories, sub(mload(memories), subSize))
            mstore(scores, sub(mload(scores), subSize))
        }
        return (memories, scores);
    }

    function filterGPUID(
        uint vramLimit,
        uint countLimit
    ) public view returns (bytes32[] memory, uint[] memory) {
        uint[] memory scores = new uint[](_availableGPUIDVramMap.length());
        bytes32[] memory ids = new bytes32[](_availableGPUIDVramMap.length());
        uint validCount = 0;

        // filter all valid gpu ids
        for (uint i = 0; i < _availableGPUIDVramMap.length(); i++) {
            (bytes32 gpuID, uint vram) = _availableGPUIDVramMap.at(i);
            if (vram >= vramLimit) {
                uint count = _gpuIDNodesIndex[gpuID].length();
                if (count >= countLimit) {
                    scores[validCount] = _gpuIDGroupScores[gpuID];
                    ids[validCount] = gpuID;
                    validCount++;
                }
            }
        }
        require(validCount > 0, "No available node");

        // resize array by assembly
        uint subSize = scores.length - validCount;
        assembly {
            mstore(ids, sub(mload(ids), subSize))
            mstore(scores, sub(mload(scores), subSize))
        }
        return (ids, scores);
    }

    function filterNodesByGPUVram(uint vram) public view returns (address[] memory, uint[] memory) {
        uint length = _gpuVramNodesIndex[vram].length();
        require(length > 0, "No available node");

        address[] memory nodes = new address[](length);
        uint[] memory scores = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address nodeAddress = _gpuVramNodesIndex[vram].at(i);
            uint score = nodesMap[nodeAddress].score;
            nodes[i] = nodeAddress;
            scores[i] = score;
        }
        return (nodes, scores);
    }

    function filterNodesByGPUID(bytes32 gpuID) public view returns (address[] memory, uint[] memory) {
        uint length = _gpuIDNodesIndex[gpuID].length();
        require(length > 0, "No available node");

        address[] memory nodes = new address[](length);
        uint[] memory scores = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address nodeAddress = _gpuIDNodesIndex[gpuID].at(i);
            uint score = nodesMap[nodeAddress].score;
            nodes[i] = nodeAddress;
            scores[i] = score;
        }
        return (nodes, scores);
    }
}
