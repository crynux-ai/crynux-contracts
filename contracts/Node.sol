// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./QOS.sol";
import "./Random.sol";
import "./NetworkStats.sol";


abstract contract TaskWithCallback {
    function nodeAvailableCallback(address root) external virtual;
}

contract Node is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using Random for Random.Generator;

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
    NetworkStats private netStats;

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

    event NodeSlashed(address nodeAddress);
    event NodeKickedOut(address nodeAddress);

    // store all nodes info
    EnumerableSet.AddressSet private allNodes;
    mapping(address => NodeInfo) private nodesMap;

    // store all available nodes;
    EnumerableSet.AddressSet private _availableNodes;
    // store available nodes indexed by gpu vram
    EnumerableSet.UintSet private _availableGPUVramSet;
    mapping(uint => EnumerableSet.Bytes32Set) _availableGPUVramIDMap;
    // store available nodes indexed by gpu type (gpuID)
    EnumerableSet.Bytes32Set private _availableGPUIDSet;
    mapping(bytes32 => EnumerableSet.AddressSet) private _gpuIDNodesIndex;
    mapping(bytes32 => uint) private _gpuIDGroupScores;

    address private taskContractAddress;

    Random.Generator private generator;

    constructor(IERC20 tokenInstance, QOS qosInstance, NetworkStats netStatsInstance) {
        cnxToken = tokenInstance;
        qos = qosInstance;
        netStats = netStatsInstance;
    }

    function getNodeInfo(
        address nodeAddress
    ) public view returns (NodeInfo memory) {
        return nodesMap[nodeAddress];
    }

    function getAvailableGPUs() public view returns (GPUInfo[] memory) {
        uint length = _availableGPUIDSet.length();
        GPUInfo[] memory res = new GPUInfo[](length);
        for (uint i = 0; i < length; i++) {
            bytes32 gpuID = _availableGPUIDSet.at(i);
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
        _availableGPUVramIDMap[vram].add(gpuID);

        // index node by gpu ID
        _availableGPUIDSet.add(gpuID);
        _gpuIDNodesIndex[gpuID].add(nodeAddress);
        _gpuIDGroupScores[gpuID] += score;

        // add node to available nodes set
        _availableNodes.add(nodeAddress);

        netStats.nodeAvailable();

        TaskWithCallback(taskContractAddress).nodeAvailableCallback(nodeAddress);
    }

    function markNodeUnavailable(address nodeAddress) private {
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;
        uint score = nodesMap[nodeAddress].score;

        // remove node from gpu id index
        _gpuIDNodesIndex[gpuID].remove(nodeAddress);
        _gpuIDGroupScores[gpuID] -= score;
        if (_gpuIDNodesIndex[gpuID].length() == 0) {
            _availableGPUIDSet.remove(gpuID);
            // remove gpuID when there is no node of this gpuID
            _availableGPUVramIDMap[vram].remove(gpuID);
            if (_availableGPUVramIDMap[vram].length() == 0) {
                _availableGPUVramSet.remove(vram);
            }
        }

        // remove node from available nodes set
        _availableNodes.remove(nodeAddress);

        netStats.nodeUnavailable();
    }

    function removeNode(address nodeAddress) private {
        delete nodesMap[nodeAddress];
        allNodes.remove(nodeAddress);
        netStats.nodeQuit();
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
        // set score 0 to 1 to avoid error occurs in multinomial function of node selection
        if (score == 0) {
            score += 1;
        }
        nodesMap[msg.sender] = NodeInfo(
            NODE_STATUS_AVAILABLE,
            gpuID,
            GPUInfo(gpuName, gpuVram),
            score
        );
        allNodes.add(msg.sender);

        markNodeAvailable(msg.sender);
        netStats.nodeJoined(msg.sender, gpuName, gpuVram);
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
        qos.kickout(nodeAddress);
        // Remove the node from the list
        removeNode(nodeAddress);
        emit NodeSlashed(nodeAddress);
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
        netStats.nodeTaskStarted();
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
        netStats.nodeTaskFinished();

        if (qos.shouldKickOut(nodeAddress)) {
            qos.kickout(nodeAddress);
            removeNode(nodeAddress);
            require(
                cnxToken.transfer(nodeAddress, requiredStakeAmount),
                "Token transfer failed"
            );
            emit NodeKickedOut(nodeAddress);
            return;
        }
        // update node qos score
        uint score = qos.getTaskScore(nodeAddress);
        // set score 0 to 1 to avoid error occurs in multinomial function of node selection
        if (score == 0) {
            score += 1;
        }
        nodesMap[nodeAddress].score = score;

        if (nodeStatus == NODE_STATUS_BUSY) {
            setNodeStatus(nodeAddress, NODE_STATUS_AVAILABLE);
            markNodeAvailable(nodeAddress);
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

    function filterGPUID(
        uint vramLimit,
        uint countLimit
    ) private view returns (bytes32[] memory, uint[] memory) {
        uint[] memory scores = new uint[](_availableGPUIDSet.length());
        bytes32[] memory ids = new bytes32[](_availableGPUIDSet.length());
        uint validCount = 0;

        // filter all valid gpu ids
        for (uint i = 0; i < _availableGPUVramSet.length(); i++) {
            uint vram = _availableGPUVramSet.at(i);
            if (vram >= vramLimit) {
                uint gpuIDCount = _availableGPUVramIDMap[vram].length();
                for (uint j = 0; j < gpuIDCount; j++){
                    bytes32 gpuID = _availableGPUVramIDMap[vram].at(j);
                    uint count = _gpuIDNodesIndex[gpuID].length();
                    if (count >= countLimit) {
                        uint score = _gpuIDGroupScores[gpuID];
                        scores[validCount] = score;
                        ids[validCount] = gpuID;
                        validCount++;
                    }
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

    function filterNodesByGPUID(bytes32 gpuID) private view returns (address[] memory, uint[] memory) {
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

    function randomSelectNodes(
        uint k,
        uint vramLimit,
        bool useSameGPU,
        bytes32 seed
    ) external returns (address[] memory) {
        require(k > 0, "select nodes count cannot be zero");

        generator.manualSeed(seed);
        address nodeAddress;
        address[] memory res = new address[](k);

        if (useSameGPU) {
            (bytes32[] memory gpuIDs, uint[] memory idScores) = filterGPUID(vramLimit, k);
            uint index = generator.multinomial(idScores, 0, idScores.length);
            bytes32 gpuID = gpuIDs[index];
            for (uint i = 0; i < k; i++) {
                (address[] memory nodes, uint[] memory scores) = filterNodesByGPUID(gpuID);
                uint j = generator.multinomial(scores, 0, nodes.length);
                nodeAddress = nodes[j];
                startTask(nodeAddress);
                res[i] = nodeAddress;
            }
        } else {
            for (uint i = 0; i < k; i++) {
                (bytes32[] memory gpuIDs, uint[] memory idScores) = filterGPUID(vramLimit, 1);
                uint index = generator.multinomial(
                    idScores,
                    0,
                    idScores.length
                );
                bytes32 gpuID = gpuIDs[index];
                (address[] memory nodes, uint[] memory scores) = filterNodesByGPUID(gpuID);
                uint j = generator.multinomial(scores, 0, nodes.length);
                nodeAddress = nodes[j];
                startTask(nodeAddress);
                res[i] = nodeAddress;
            }
        }

        return res;
    }

    function selectNodesWithRoot(
        address root,
        uint k
    ) external view returns (address[] memory) {
        require(k > 0, "select nodes count cannot be zero");
        require(_availableNodes.length() >= k, "No available node");
        require(_availableNodes.contains(root), "root node should be available");

        address[] memory res = new address[](k);
        // root node must be included in result
        res[0] = root;

        if (k == 1) {
            return res;
        }

        bytes32 rootGPUID = nodesMap[root].gpuID;
        if (_gpuIDNodesIndex[rootGPUID].length() >= k) {
            // get nodes with the same gpu as root node first
            uint index = 1;
            for (uint i = 0; i < _gpuIDNodesIndex[rootGPUID].length() && index < k; i++) {
                address nodeAddress = _gpuIDNodesIndex[rootGPUID].at(i);
                if (nodeAddress != root) {
                    res[index] = nodeAddress;
                    index++;
                }
            }
        } else {
            // get nodes with largest vram
            uint index = 1;
            uint lastMaxVram = 0;
            while (index < k) {
                uint maxVram = 0;
                for (uint i = 0; i < _availableGPUVramSet.length(); i++) {
                    uint vram = _availableGPUVramSet.at(i);
                    if (vram > maxVram && (lastMaxVram == 0 || vram < lastMaxVram)) {
                        maxVram = vram;
                    }
                }

                for (uint i = 0; i < _availableGPUVramIDMap[maxVram].length() && index < k; i++) {
                    bytes32 gpuID = _availableGPUVramIDMap[maxVram].at(i);
                    for (uint j = 0; j < _gpuIDNodesIndex[gpuID].length() && index < k; j++) {
                        address nodeAddress = _gpuIDNodesIndex[gpuID].at(j);
                        if (nodeAddress != root) {
                            res[index] = nodeAddress;
                            index++;
                        }
                    }
                }
                lastMaxVram = maxVram;
            }
        }
        return res;
    }
}
