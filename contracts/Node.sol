// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./QOS.sol";
import "./Random.sol";
import "./NetworkStats.sol";
import "./libs/Version.sol";

abstract contract TaskWithCallback {
    function nodeAvailableCallback(address root) external virtual;
}

contract Node is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

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
    Random private random;

    struct GPUInfo {
        string name;
        uint vram;
    }

    struct NodeInfo {
        NodeStatus status;
        bytes32 gpuID;
        GPUInfo gpu;
        uint score;
        uint[3] version;
        bytes publicKey;
        string[] lastModelIDs;
        string[] localModelIDs;
    }

    event NodeSlashed(address nodeAddress);
    event NodeKickedOut(address nodeAddress);

    // store nodes staked eth amount
    mapping(address => uint) private stakedAmount;

    // store all nodes info
    EnumerableSet.AddressSet private allNodes;
    mapping(address => NodeInfo) private nodesMap;
    // store all nodes indexed by gpu vram
    EnumerableSet.UintSet private _allGPUVramSet;
    mapping(uint => EnumerableSet.AddressSet) _allGPUVramNodesIndex;
    // store all nodes indexed by gpu type
    EnumerableSet.Bytes32Set private _allGPUIDSet;
    mapping(bytes32 => EnumerableSet.AddressSet) private _allGPUIDNodesIndex;

    // store all available nodes;
    EnumerableSet.AddressSet private _availableNodes;
    // store available nodes indexed by gpu vram
    EnumerableSet.UintSet private _availableGPUVramSet;
    mapping(uint => EnumerableSet.AddressSet) _availableGPUVramNodesIndex;
    // store available nodes indexed by gpu type (gpuID)
    EnumerableSet.Bytes32Set private _availableGPUIDSet;
    mapping(bytes32 => EnumerableSet.AddressSet)
        private _availableGPUIDNodesIndex;

    // store all local models ids
    EnumerableSet.Bytes32Set private _modelIDSet;
    // store all nodes indexed by their local model ids
    mapping(bytes32 => EnumerableSet.AddressSet) private _modelIDNodesIndex;

    address private taskContractAddress;

    Random.Generator private generator;

    constructor(
        QOS qosInstance,
        NetworkStats netStatsInstance
    ) Ownable(msg.sender) {
        qos = qosInstance;
        netStats = netStatsInstance;
        random = new Random();
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
            address nodeAddress = _availableGPUIDNodesIndex[gpuID].at(0);
            res[i] = nodesMap[nodeAddress].gpu;
        }
        return res;
    }

    function getAvailableNodes() public view returns (address[] memory) {
        return _availableNodes.values();
    }

    function getNodeStatus(
        address nodeAddress
    ) public view returns (NodeStatus) {
        return nodesMap[nodeAddress].status;
    }

    function nodeContainsModelID(address nodeAddress, string calldata modelID) public view returns (bool) {
        require(allNodes.contains(nodeAddress), "Node has quitted");
        bytes32 modelIDHash = keccak256(abi.encodePacked(modelID));
        return _modelIDNodesIndex[modelIDHash].contains(nodeAddress);
    }

    function setNodeStatus(address nodeAddress, NodeStatus status) private {
        nodesMap[nodeAddress].status = status;
    }

    function markNodeAvailable(address nodeAddress) private {
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;

        // index node by gpu memory
        _availableGPUVramSet.add(vram);
        _availableGPUVramNodesIndex[vram].add(nodeAddress);

        // index node by gpu ID
        _availableGPUIDSet.add(gpuID);
        _availableGPUIDNodesIndex[gpuID].add(nodeAddress);

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
        _availableGPUIDNodesIndex[gpuID].remove(nodeAddress);
        _availableGPUVramNodesIndex[vram].remove(nodeAddress);
        if (_availableGPUIDNodesIndex[gpuID].length() == 0) {
            _availableGPUIDSet.remove(gpuID);
        }
        if (_availableGPUVramNodesIndex[vram].length() == 0) {
            _availableGPUVramSet.remove(vram);
        }

        // remove node from available nodes set
        _availableNodes.remove(nodeAddress);

        netStats.nodeUnavailable();
    }

    function addNode(address nodeAddress) private {
        string memory gpuName = nodesMap[nodeAddress].gpu.name;
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;

        allNodes.add(nodeAddress);

        // index node by gpu memory
        _allGPUVramSet.add(vram);
        _allGPUVramNodesIndex[vram].add(nodeAddress);
        // index node by gpu ID
        _allGPUIDSet.add(gpuID);
        _allGPUIDNodesIndex[gpuID].add(nodeAddress);
        // index node local model ids
        for (uint i = 0; i < nodesMap[nodeAddress].localModelIDs.length; i++) {
            addLocalModelIndex(nodeAddress, nodesMap[nodeAddress].localModelIDs[i]);
        }

        netStats.nodeJoined(msg.sender, gpuName, vram);
    }

    function removeNode(address nodeAddress) private {
        uint vram = nodesMap[nodeAddress].gpu.vram;
        bytes32 gpuID = nodesMap[nodeAddress].gpuID;

        // remove node from gpu id and vram index
        _allGPUIDNodesIndex[gpuID].remove(nodeAddress);
        _allGPUVramNodesIndex[vram].remove(nodeAddress);
        if (_allGPUIDNodesIndex[gpuID].length() == 0) {
            _allGPUIDSet.remove(gpuID);
        }
        if (_allGPUVramNodesIndex[vram].length() == 0) {
            _allGPUVramSet.remove(vram);
        }
        // remove node local model ids
        for (uint i = 0; i < nodesMap[nodeAddress].localModelIDs.length; i++) {
            removeLocalModelIndex(nodeAddress, nodesMap[nodeAddress].localModelIDs[i]);
        }

        allNodes.remove(nodeAddress);
        delete nodesMap[nodeAddress];
        netStats.nodeQuit();
    }

    function addLocalModelIndex(
        address nodeAddress,
        string memory modelID
    ) internal {
        require(allNodes.contains(nodeAddress), "Node has quitted");
        bytes32 modelIDHash = keccak256(abi.encodePacked(modelID));
        _modelIDSet.add(modelIDHash);
        _modelIDNodesIndex[modelIDHash].add(nodeAddress);
    }

    function removeLocalModelIndex(
        address nodeAddress,
        string memory modelID
    ) internal {
        require(allNodes.contains(nodeAddress), "Node has quitted");
        bytes32 modelIDHash = keccak256(abi.encodePacked(modelID));
        _modelIDNodesIndex[modelIDHash].remove(nodeAddress);
        if (_modelIDNodesIndex[modelIDHash].length() == 0) {
            _modelIDSet.remove(modelIDHash);
            delete _modelIDNodesIndex[modelIDHash];
        }
    }

    function reportModelDownloaded(string calldata modelID) public {
        require(allNodes.contains(msg.sender), "Node has quitted");
        bytes32 modelIDHash = keccak256(abi.encodePacked(modelID));
        if (!_modelIDNodesIndex[modelIDHash].contains(msg.sender)) {
            _modelIDSet.add(modelIDHash);
            _modelIDNodesIndex[modelIDHash].add(msg.sender);
            nodesMap[msg.sender].localModelIDs.push(modelID);
        }
    }

    function join(
        string calldata gpuName,
        uint gpuVram,
        uint[3] calldata version,
        bytes calldata publicKey,
        string[] calldata modelIDs
    ) public payable {
        require(allNodes.length() < maxNodesAllowed, "Network is full");
        require(
            getNodeStatus(msg.sender) == NodeStatus.Quit,
            "Node already joined"
        );

        require(publicKey.length == 64, "Invalid public key length");

        uint derivedAddress = uint(keccak256(publicKey)) &
            0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

        require(
            derivedAddress == uint(uint160(msg.sender)),
            "Public key mismatch"
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
        nodesMap[msg.sender].status = NodeStatus.Available;
        nodesMap[msg.sender].gpuID = gpuID;
        nodesMap[msg.sender].gpu = GPUInfo(gpuName, gpuVram);
        nodesMap[msg.sender].score = score;
        nodesMap[msg.sender].version = version;
        nodesMap[msg.sender].publicKey = publicKey;
        nodesMap[msg.sender].localModelIDs = modelIDs;

        addNode(msg.sender);
        markNodeAvailable(msg.sender);
    }

    function updateVersion(uint[3] calldata version) public {
        require(
            getNodeStatus(msg.sender) != NodeStatus.Quit,
            "Node has quitted"
        );
        nodesMap[msg.sender].version = version;
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

    function filterAvailableNodesByGPUID(
        bytes32 gpuID,
        uint[3] calldata taskVersion
    ) private view returns (address[] memory, uint[] memory) {
        uint length = _availableGPUIDNodesIndex[gpuID].length();
        require(length > 0, "No available node");

        uint count = 0;
        address[] memory nodes = new address[](length);
        uint[] memory scores = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address nodeAddress = _availableGPUIDNodesIndex[gpuID].at(i);
            uint[3] memory nodeVersion = nodesMap[nodeAddress].version;
            if (Version.matchVersion(nodeVersion, taskVersion)) {
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

    function filterNodesByGPUID(
        bytes32 gpuID,
        uint[3] calldata taskVersion
    ) private view returns (address[] memory, uint[] memory) {
        uint length = _allGPUIDNodesIndex[gpuID].length();
        require(length > 0, "No available node");

        uint count = 0;
        address[] memory nodes = new address[](length);
        uint[] memory scores = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address nodeAddress = _allGPUIDNodesIndex[gpuID].at(i);
            uint[3] memory nodeVersion = nodesMap[nodeAddress].version;
            if (Version.matchVersion(nodeVersion, taskVersion)) {
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

    function filterAvailableNodesByVram(
        uint minimumVRAM,
        uint[3] calldata taskVersion
    ) private view returns (address[] memory, uint[] memory) {
        uint length = _availableNodes.length();
        if (length == 0) {
            return (new address[](0), new uint[](0));
        }

        uint count = 0;
        address[] memory nodes = new address[](length);
        uint[] memory scores = new uint[](length);

        for (uint i = 0; i < _availableGPUVramSet.length(); i++) {
            uint vram = _availableGPUVramSet.at(i);
            if (vram >= minimumVRAM) {
                for (
                    uint j = 0;
                    j < _availableGPUVramNodesIndex[vram].length();
                    j++
                ) {
                    address nodeAddress = _availableGPUVramNodesIndex[vram].at(
                        j
                    );
                    uint[3] memory nodeVersion = nodesMap[nodeAddress].version;
                    if (Version.matchVersion(nodeVersion, taskVersion)) {
                        uint score = nodesMap[nodeAddress].score;
                        nodes[count] = nodeAddress;
                        scores[count] = score;
                        count++;
                    }
                }
            }
        }
        if (count == 0) {
            return (new address[](0), new uint[](0));
        }

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
        uint[3] calldata taskVersion
    ) private view returns (address[] memory, uint[] memory) {
        uint length = allNodes.length();
        if (length == 0) {
            return (new address[](0), new uint[](0));
        }

        uint count = 0;
        address[] memory nodes = new address[](length);
        uint[] memory scores = new uint[](length);

        for (uint i = 0; i < _allGPUVramSet.length(); i++) {
            uint vram = _allGPUVramSet.at(i);
            if (vram >= minimumVRAM) {
                for (
                    uint j = 0;
                    j < _allGPUVramNodesIndex[vram].length();
                    j++
                ) {
                    address nodeAddress = _allGPUVramNodesIndex[vram].at(j);
                    uint[3] memory nodeVersion = nodesMap[nodeAddress].version;
                    if (Version.matchVersion(nodeVersion, taskVersion)) {
                        uint score = nodesMap[nodeAddress].score;
                        nodes[count] = nodeAddress;
                        scores[count] = score;
                        count++;
                    }
                }
            }
        }
        if (count == 0) {
            return (new address[](0), new uint[](0));
        }

        // resize array by assembly
        uint subSize = length - count;
        assembly {
            mstore(nodes, sub(mload(nodes), subSize))
            mstore(scores, sub(mload(scores), subSize))
        }

        return (nodes, scores);
    }

    function selectNodesWithModelID(
        address[] memory nodes,
        uint[] memory scores,
        string[] calldata modelIDs
    ) internal view returns (address[] memory, uint[] memory) {
        // filter nodes whos localModelIDs contains modelID
        // if all nodes localModelIDs don't contain modelID, return all the nodes

        uint count = 0;
        bool[] memory isSelected = new bool[](nodes.length);
        uint[] memory changedScores = new uint[](nodes.length);

        for (uint i = 0; i < modelIDs.length; i++) {
            bytes32 modelIDHash = keccak256(abi.encodePacked(modelIDs[i]));
            if (!_modelIDSet.contains(modelIDHash)) {
                continue;
            }

            for (uint j = 0; j < nodes.length; j++) {
                address nodeAddress = nodes[j];
                bool contains = _modelIDNodesIndex[modelIDHash].contains(
                    nodeAddress
                );
                if (contains) {
                    if (isSelected[j]) {
                        changedScores[j] += scores[j];
                    } else {
                        isSelected[j] = true;
                        changedScores[j] = scores[j];
                        count++;
                    }
                }
            }

        }

        if (count == 0) {
            return (nodes, scores);
        }

        address[] memory resultNodes = new address[](count);
        uint[] memory resultScores = new uint[](count);
        uint n = 0;
        for (uint i = 0; i < nodes.length; i++) {
            if (isSelected[i]) {
                resultNodes[n] = nodes[i];
                resultScores[n] = changedScores[i];
                n++;
            }
        }

        return (resultNodes, resultScores);
    }

    function selectNodesWithoutModelID(
        address[] memory nodes,
        uint[] memory scores,
        string calldata modelID
    ) internal view returns (address[] memory, uint[] memory) {
        bytes32 modelIDHash = keccak256(abi.encodePacked(modelID));
        if (!_modelIDSet.contains(modelIDHash)) {
            return (nodes, scores);
        }

        uint count = 0;
        address[] memory resultNodes = new address[](nodes.length);
        uint[] memory resultScores = new uint[](nodes.length);

        for (uint i = 0; i < nodes.length; i++) {
            address nodeAddress = nodes[i];
            bool contains = _modelIDNodesIndex[modelIDHash].contains(
                nodeAddress
            );
            if (!contains) {
                resultNodes[count] = nodeAddress;
                resultScores[count] = scores[i];
                count++;
            }
        }

        if (count == 0) {
            return (new address[](0), new uint[](0));
        }

        // resize array by assembly
        uint subSize = nodes.length - count;
        assembly {
            mstore(resultNodes, sub(mload(resultNodes), subSize))
            mstore(resultScores, sub(mload(resultScores), subSize))
        }

        return (resultNodes, resultScores);
    }

    function addScoreByModelIDs(
        address[] memory nodes,
        uint[] memory scores,
        string[] calldata modelIDs
    ) internal view returns (address[] memory, uint[] memory) {
        // add extra score to nodes with the same last model ID as the current model ID
        for (uint i = 0; i < nodes.length; i++) {
            address nodeAddress = nodes[i];
            string[] memory lastModelIDs = nodesMap[nodeAddress].lastModelIDs;
            if (keccak256(abi.encode(lastModelIDs)) == keccak256(abi.encode(modelIDs))) {
                scores[i] *= 2;
            }
        }
        return (nodes, scores);
    }

    function randomSelectAvailableNode(
        bytes32 seed,
        uint minimumVRAM,
        string calldata requiredGPU,
        uint requiredGPUVRAM,
        uint[3] calldata taskVersion,
        string[] calldata modelIDs
    ) external returns (address) {
        random.manualSeed(seed);
        if (bytes(requiredGPU).length > 0) {
            bytes32 gpuID = keccak256(
                abi.encodePacked(requiredGPU, requiredGPUVRAM)
            );

            if (_availableGPUIDSet.contains(gpuID)) {
                (
                    address[] memory nodes,
                    uint[] memory scores
                ) = filterAvailableNodesByGPUID(gpuID, taskVersion);
                (nodes, scores) = selectNodesWithModelID(
                    nodes,
                    scores,
                    modelIDs
                );
                addScoreByModelIDs(nodes, scores, modelIDs);
                uint index = random.choice(scores);
                return nodes[index];
            } else {
                revert("No available node");
            }
        } else {
            (
                address[] memory nodes,
                uint[] memory scores
            ) = filterAvailableNodesByVram(minimumVRAM, taskVersion);
            (nodes, scores) = selectNodesWithModelID(nodes, scores, modelIDs);
            addScoreByModelIDs(nodes, scores, modelIDs);
            uint index = random.choice(scores);
            return nodes[index];
        }
    }

    function randomSelectNodesWithoutModelID(
        bytes32 seed,
        uint minimumVRAM,
        string calldata requiredGPU,
        uint requiredGPUVRAM,
        uint[3] calldata taskVersion,
        string calldata modelID,
        uint count
    ) external returns (address[] memory) {
        random.manualSeed(seed);

        if (bytes(requiredGPU).length > 0) {
            bytes32 gpuID = keccak256(
                abi.encodePacked(requiredGPU, requiredGPUVRAM)
            );

            if (_allGPUIDSet.contains(gpuID)) {
                (
                    address[] memory nodes,
                    uint[] memory scores
                ) = filterNodesByGPUID(gpuID, taskVersion);
                (nodes, scores) = selectNodesWithoutModelID(
                    nodes,
                    scores,
                    modelID
                );
                if (nodes.length < count) {
                    return nodes;
                }
                uint[] memory indices = random.choices(scores, count);
                address[] memory results = new address[](count);
                for (uint i = 0; i < count; i++) {
                    results[i] = nodes[indices[i]];
                }
                return results;
            } else {
                return new address[](0);
            }
        } else {
            (address[] memory nodes, uint[] memory scores) = filterNodesByVram(
                minimumVRAM,
                taskVersion
            );
            (nodes, scores) = selectNodesWithoutModelID(nodes, scores, modelID);
            if (nodes.length < count) {
                return nodes;
            }
            uint[] memory indices = random.choices(scores, count);
            address[] memory results = new address[](count);
            for (uint i = 0; i < count; i++) {
                results[i] = nodes[indices[i]];
            }
            return results;
        }
    }
}
