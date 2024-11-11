// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./QOS.sol";
import "./libs/Random.sol";
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
    enum NodeStatus {
        Quit,
        Available,
        Busy,
        PendingPause,
        PendingQuit,
        Paused
    }

    QOS private qos;
    NetworkStats private netStats;

    struct GPUInfo {
        string name;
        uint vram;
    }

    struct NodeInfo {
        NodeStatus status;
        bytes32 gpuID;
        GPUInfo gpu;
        uint score;
        string version;
        bytes publicKey;
        string lastModelID;
    }

    event NodeSlashed(address nodeAddress);
    event NodeKickedOut(address nodeAddress);

    // store nodes staked eth amount
    mapping(address => uint) private stakedAmount;

    // store all nodes info
    EnumerableSet.AddressSet private allNodes;
    mapping(address => NodeInfo) private nodesMap;

    // store all available nodes;
    EnumerableSet.AddressSet private _availableNodes;
    // store available nodes indexed by gpu vram
    EnumerableSet.UintSet private _availableGPUVramSet;
    mapping(uint => EnumerableSet.AddressSet) _gpuVramNodesIndex;
    // store available nodes indexed by gpu type (gpuID)
    EnumerableSet.Bytes32Set private _availableGPUIDSet;
    mapping(bytes32 => EnumerableSet.AddressSet) private _gpuIDNodesIndex;

    address private taskContractAddress;

    Random.Generator private generator;

    constructor(
        QOS qosInstance,
        NetworkStats netStatsInstance
    ) Ownable(msg.sender) {
        qos = qosInstance;
        netStats = netStatsInstance;
    }

    function getNodeInfo(
        address nodeAddress
    ) public view returns (NodeInfo memory) {
        return nodesMap[nodeAddress];
    }

    function getStakedAmount(address nodeAddress) public view returns (uint) {
        return stakedAmount[nodeAddress];
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

    function getNodeStatus(address nodeAddress) public view returns (NodeStatus) {
        return nodesMap[nodeAddress].status;
    }

    function setNodeStatus(address nodeAddress, NodeStatus status) private {
        nodesMap[nodeAddress].status = status;
    }

    function markNodeAvailable(address nodeAddress) private {
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;

        // index node by gpu memory
        _availableGPUVramSet.add(vram);
        _gpuVramNodesIndex[vram].add(nodeAddress);

        // index node by gpu ID
        _availableGPUIDSet.add(gpuID);
        _gpuIDNodesIndex[gpuID].add(nodeAddress);

        // add node to available nodes set
        _availableNodes.add(nodeAddress);

        netStats.nodeAvailable();

        TaskWithCallback(taskContractAddress).nodeAvailableCallback(
            nodeAddress
        );
    }

    function markNodeUnavailable(address nodeAddress) private {
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;

        // remove node from gpu id and vram index
        _gpuIDNodesIndex[gpuID].remove(nodeAddress);
        _gpuVramNodesIndex[vram].remove(nodeAddress);
        if (_gpuIDNodesIndex[gpuID].length() == 0) {
            _availableGPUIDSet.remove(gpuID);
        }
        if (_gpuVramNodesIndex[vram].length() == 0) {
            _availableGPUVramSet.remove(vram);
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

    function join(
        string calldata gpuName,
        uint gpuVram,
        string calldata version,
        bytes calldata publicKey
    ) public payable {
        require(allNodes.length() < maxNodesAllowed, "Network is full");
        require(
            getNodeStatus(msg.sender) == NodeStatus.Quit,
            "Node already joined"
        );

        // Check the staking
        uint token = msg.value;
        require(token >= requiredStakeAmount, "Staked amount is not enough");
        stakedAmount[msg.sender] = token;

        // add nodes to nodesMap
        bytes32 gpuID = keccak256(abi.encodePacked(gpuName, gpuVram));
        uint score = qos.getTaskScore(msg.sender);
        // set score 0 to 1 to avoid error occurs in multinomial function of node selection
        if (score == 0) {
            score += 1;
        }
        nodesMap[msg.sender] = NodeInfo(
            NodeStatus.Available,
            gpuID,
            GPUInfo(gpuName, gpuVram),
            score,
            version,
            publicKey,
            ""
        );
        allNodes.add(msg.sender);

        markNodeAvailable(msg.sender);
        netStats.nodeJoined(msg.sender, gpuName, gpuVram);
    }

    function quit() public {
        NodeStatus nodeStatus = getNodeStatus(msg.sender);

        if (
            nodeStatus == NodeStatus.Available ||
            nodeStatus == NodeStatus.Paused
        ) {
            // Remove the node from the list
            if (nodeStatus == NodeStatus.Available) {
                markNodeUnavailable(msg.sender);
            }

            removeNode(msg.sender);

            // Return the staked tokens
            uint token = stakedAmount[msg.sender];
            stakedAmount[msg.sender] = 0;
            (bool success, ) = msg.sender.call{value: token}("");
            require(success, "Token transfer failed");
        } else if (nodeStatus == NodeStatus.Busy) {
            setNodeStatus(msg.sender, NodeStatus.PendingQuit);
        } else {
            revert("Illegal node status");
        }
    }

    function pause() public {
        NodeStatus nodeStatus = getNodeStatus(msg.sender);

        if (nodeStatus == NodeStatus.Available) {
            setNodeStatus(msg.sender, NodeStatus.Paused);
            markNodeUnavailable(msg.sender);
        } else if (nodeStatus == NodeStatus.Busy) {
            setNodeStatus(msg.sender, NodeStatus.PendingPause);
        } else {
            revert("Illegal node status");
        }
    }

    function resume() public {
        require(
            getNodeStatus(msg.sender) == NodeStatus.Paused,
            "Illegal node status"
        );
        setNodeStatus(msg.sender, NodeStatus.Available);
        markNodeAvailable(msg.sender);
    }

    function slash(address nodeAddress) public {
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        NodeStatus nodeStatus = getNodeStatus(nodeAddress);
        require(
            nodeStatus == NodeStatus.Busy ||
                nodeStatus == NodeStatus.PendingPause ||
                nodeStatus == NodeStatus.PendingQuit,
            "Illegal node status"
        );

        uint token = stakedAmount[nodeAddress];
        stakedAmount[nodeAddress] = 0;
        (bool success, ) = owner().call{value: token}("");
        require(success, "Token transfer failed");

        qos.finishTask(nodeAddress);
        qos.kickout(nodeAddress);
        netStats.nodeTaskFinished();
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
            getNodeStatus(nodeAddress) == NodeStatus.Available,
            "Node is not available"
        );
        markNodeUnavailable(nodeAddress);
        setNodeStatus(nodeAddress, NodeStatus.Busy);
        qos.startTask(nodeAddress);
        netStats.nodeTaskStarted();
    }

    function finishTask(address nodeAddress) public {
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        NodeStatus nodeStatus = getNodeStatus(nodeAddress);
        require(
            nodeStatus == NodeStatus.Busy ||
                nodeStatus == NodeStatus.PendingPause ||
                nodeStatus == NodeStatus.PendingQuit,
            "Illegal node status"
        );

        qos.finishTask(nodeAddress);
        netStats.nodeTaskFinished();

        if (qos.shouldKickOut(nodeAddress)) {
            qos.kickout(nodeAddress);
            removeNode(nodeAddress);
            uint token = stakedAmount[nodeAddress];
            stakedAmount[nodeAddress] = 0;
            (bool success, ) = nodeAddress.call{value: token}("");
            require(success, "Token transfer failed");
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

        if (nodeStatus == NodeStatus.Busy) {
            setNodeStatus(nodeAddress, NodeStatus.Available);
            markNodeAvailable(nodeAddress);
        } else if (nodeStatus == NodeStatus.PendingQuit) {
            // Remove the node from the list
            removeNode(nodeAddress);

            uint token = stakedAmount[nodeAddress];
            stakedAmount[nodeAddress] = 0;
            (bool success, ) = nodeAddress.call{value: token}("");
            require(success, "Token transfer failed");
        } else if (nodeStatus == NodeStatus.PendingPause) {
            setNodeStatus(nodeAddress, NodeStatus.Paused);
        }
    }

    function updateTaskContractAddress(address taskContract) public onlyOwner {
        taskContractAddress = taskContract;
    }

    function filterNodesByGPUID(
        bytes32 gpuID,
        string calldata taskVersion
    ) private view returns (address[] memory, uint[] memory) {
        uint length = _gpuIDNodesIndex[gpuID].length();
        require(length > 0, "No available node");

        uint count = 0;
        address[] memory nodes = new address[](length);
        uint[] memory scores = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address nodeAddress = _gpuIDNodesIndex[gpuID].at(i);
            string memory nodeVersion = nodesMap[nodeAddress].version;
            if (
                keccak256(bytes(nodeVersion)) == keccak256(bytes(taskVersion))
            ) {
                uint score = nodesMap[nodeAddress].score;
                nodes[count] = nodeAddress;
                scores[count] = score;
                count++;
            }
        }
        require(count > 0, "No available node");

        // resize array by assembly
        uint subSize = length - count;
        assembly {
            mstore(nodes, sub(mload(nodes), subSize))
            mstore(scores, sub(mload(scores), subSize))
        }

        return (nodes, scores);
    }

    function filterNodesByVram(
        uint minimumVRAM,
        string calldata taskVersion
    ) private view returns (address[] memory, uint[] memory) {
        uint length = _availableNodes.length();
        require(length > 0, "No available node");

        uint count = 0;
        address[] memory nodes = new address[](length);
        uint[] memory scores = new uint[](length);

        for (uint i = 0; i < _availableGPUVramSet.length(); i++) {
            uint vram = _availableGPUVramSet.at(i);
            if (vram >= minimumVRAM) {
                for (uint j = 0; j < _gpuVramNodesIndex[vram].length(); j++) {
                    address nodeAddress = _gpuVramNodesIndex[vram].at(j);
                    string memory nodeVersion = nodesMap[nodeAddress].version;
                    if (
                        keccak256(bytes(nodeVersion)) ==
                        keccak256(bytes(taskVersion))
                    ) {
                        uint score = nodesMap[nodeAddress].score;
                        nodes[count] = nodeAddress;
                        scores[count] = score;
                        count++;
                    }
                }
            }
        }
        require(count > 0, "No available node");

        // resize array by assembly
        uint subSize = length - count;
        assembly {
            mstore(nodes, sub(mload(nodes), subSize))
            mstore(scores, sub(mload(scores), subSize))
        }

        return (nodes, scores);
    }

    function addScoreByModelID(
        address[] memory nodes,
        uint[] memory scores,
        string calldata modelID
    ) internal view returns (address[] memory, uint[] memory) {
        for (uint i = 0; i < nodes.length; i++) {
            address nodeAddress = nodes[i];
            string memory lastModelID = nodesMap[nodeAddress].lastModelID;
            if (keccak256(bytes(lastModelID)) == keccak256(bytes(modelID))) {
                scores[i] += qos.getTaskScoreLimit();
            }
        }
        return (nodes, scores);
    }

    function randomSelectNode(
        bytes32 seed,
        uint minimumVRAM,
        string calldata requiredGPU,
        uint requiredGPUVRAM,
        string calldata taskVersion,
        string calldata modelID
    ) external returns (address) {
        generator.manualSeed(seed);
        if (bytes(requiredGPU).length > 0) {
            bytes32 gpuID = keccak256(
                abi.encodePacked(requiredGPU, requiredGPUVRAM)
            );

            if (_availableGPUIDSet.contains(gpuID)) {
                (
                    address[] memory nodes,
                    uint[] memory scores
                ) = filterNodesByGPUID(gpuID, taskVersion);
                // add extra score to nodes with the same last model ID as the current model ID
                addScoreByModelID(nodes, scores, modelID);
                uint index = generator.multinomial(scores, 0, scores.length);
                return nodes[index];
            } else {
                revert("No available node");
            }
        } else {
            (address[] memory nodes, uint[] memory scores) = filterNodesByVram(
                minimumVRAM,
                taskVersion
            );
            // add extra score to nodes with the same last model ID as the current model ID
            addScoreByModelID(nodes, scores, modelID);
            uint index = generator.multinomial(scores, 0, scores.length);
            return nodes[index];
        }
    }
}
