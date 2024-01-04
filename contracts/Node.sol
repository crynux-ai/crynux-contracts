// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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

    struct GPUInfo {
        string name;
        uint vram;
    }

    struct NodeInfo {
        uint status;
        bytes32 gpuID;
        GPUInfo gpu;
    }

    // store all nodes info
    EnumerableSet.AddressSet private allNodes;
    mapping(address => NodeInfo) private nodesMap;

    // store all available nodes;
    EnumerableSet.AddressSet private _availableNodes;
    // store available nodes indexed by gpu vram
    EnumerableSet.UintSet private _availableGPUVramSet;
    mapping(uint => EnumerableSet.AddressSet) private _gpuVramNodesIndex;
    // store available nodes indexed by gpu type (gpuID)
    EnumerableMap.Bytes32ToUintMap private _availableGPUIDVramMap;
    mapping(bytes32 => EnumerableSet.AddressSet) private _gpuIDNodesIndex;

    address private taskContractAddress;

    constructor(IERC20 tokenInstance) {
        cnxToken = tokenInstance;
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

        // index node by gpu memory
        _availableGPUVramSet.add(vram);
        _gpuVramNodesIndex[vram].add(nodeAddress);

        // index node by gpu ID
        _availableGPUIDVramMap.set(gpuID, vram);
        _gpuIDNodesIndex[gpuID].add(nodeAddress);

        // add node to available nodes set
        _availableNodes.add(nodeAddress);
    }

    function markNodeUnavailable(address nodeAddress) private {
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;

        // remove node from gpu index
        _gpuVramNodesIndex[vram].remove(nodeAddress);
        if (_gpuVramNodesIndex[vram].length() == 0) {
            _availableGPUVramSet.remove(vram);
        }

        // remove node from gpu id index
        _gpuIDNodesIndex[gpuID].remove(nodeAddress);
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
        nodesMap[msg.sender] = NodeInfo(
            NODE_STATUS_AVAILABLE,
            gpuID,
            GPUInfo(gpuName, gpuVram)
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
        uint[] memory counts = new uint[](_availableGPUVramSet.length());
        uint[] memory memories = new uint[](_availableGPUVramSet.length());
        uint validCount = 0;

        // filter all valid gpu memory
        for (uint i = 0; i < _availableGPUVramSet.length(); i++) {
            uint gpuMemory = _availableGPUVramSet.at(i);
            if (gpuMemory >= vramLimit) {
                uint count = _gpuVramNodesIndex[gpuMemory].length();
                if (count >= countLimit) {
                    counts[validCount] = count;
                    memories[validCount] = gpuMemory;
                    validCount++;
                }
            }
        }
        require(validCount > 0, "No kind of gpu vram meets condition");

        // resize array by assembly
        uint subSize = counts.length - validCount;
        assembly {
            mstore(memories, sub(mload(memories), subSize))
            mstore(counts, sub(mload(counts), subSize))
        }
        return (memories, counts);
    }

    function filterGPUID(
        uint vramLimit,
        uint countLimit
    ) public view returns (bytes32[] memory, uint[] memory) {
        uint[] memory counts = new uint[](_availableGPUIDVramMap.length());
        bytes32[] memory ids = new bytes32[](_availableGPUIDVramMap.length());
        uint validCount = 0;

        // filter all valid gpu ids
        for (uint i = 0; i < _availableGPUIDVramMap.length(); i++) {
            (bytes32 gpuID, uint vram) = _availableGPUIDVramMap.at(i);
            if (vram >= vramLimit) {
                uint count = _gpuIDNodesIndex[gpuID].length();
                if (count >= countLimit) {
                    counts[validCount] = count;
                    ids[validCount] = gpuID;
                    validCount++;
                }
            }
        }
        require(validCount > 0, "No kind of gpu id meets condition");

        // resize array by assembly
        uint subSize = counts.length - validCount;
        assembly {
            mstore(ids, sub(mload(ids), subSize))
            mstore(counts, sub(mload(counts), subSize))
        }
        return (ids, counts);
    }

    function selectNodeByGPUVram(
        uint vram,
        uint index
    ) public view returns (address) {
        uint length = _gpuVramNodesIndex[vram].length();
        require(length > 0, "No available nodes of such vram");
        return _gpuVramNodesIndex[vram].at(index % length);
    }

    function selectNodeByGPUID(
        bytes32 gpuID,
        uint index
    ) public view returns (address) {
        uint length = _gpuIDNodesIndex[gpuID].length();
        require(length > 0, "No available nodes of such gpu id");
        return _gpuIDNodesIndex[gpuID].at(index % length);
    }

    function selectNode(uint index) public view returns (address) {
        uint length = _availableNodes.length();
        require(length > 0, "No available nodes");
        return _availableNodes.at(index % length);
    }
}
