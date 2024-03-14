// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NetworkStats is Ownable {

    using EnumerableSet for EnumerableSet.AddressSet;

    struct NodeInfo {
        address nodeAddress;
        string GPUModel;
        uint VRAM;
    }

    EnumerableSet.AddressSet private _allNodes;
    mapping(address => NodeInfo) private _nodesMap;

    uint private _totalNodes = 0;
    uint private _activeNodes = 0;
    uint private _availableNodes = 0;
    uint private _busyNodes = 0;

    uint256 private _totalTasks = 0;
    uint256 private _runningTasks = 0;
    uint256 private _queuedTasks = 0;

    address private nodeContractAddress;
    address private taskContractAddress;

    function updateNodeContractAddress(address nodeContract) public onlyOwner {
        nodeContractAddress = nodeContract;
    }

    function updateTaskContractAddress(address taskContract) public onlyOwner {
        taskContractAddress = taskContract;
    }

    function totalNodes() public view returns (uint) {
        return _totalNodes;
    }

    function activeNodes() public view returns (uint) {
        return _activeNodes;
    }

    function availableNodes() public view returns (uint) {
        return _availableNodes;
    }

    function busyNodes() public view returns (uint) {
        return _busyNodes;
    }

    function totalTasks() public view returns (uint256) {
        return _totalTasks;
    }

    function queuedTasks() public view returns (uint256) {
        return _queuedTasks;
    }

    function runningTasks() public view returns (uint256) {
        return _runningTasks;
    }

    function getAllNodeInfo(uint offset, uint length) public view returns (NodeInfo[] memory) {
        NodeInfo[] memory nodes = new NodeInfo[](length);
        for(uint i=0; i<length; i++) {
            nodes[i] = _nodesMap[_allNodes.at(offset + i)];
        }

        return nodes;
    }

    function nodeJoined(address nodeAddress, string calldata gpuModel, uint vRAM) public {
        require(
            msg.sender == nodeContractAddress,
            "Not called by the node contract"
        );

        _activeNodes++;
        _availableNodes++;

        if(!_allNodes.contains(nodeAddress)) {
            _allNodes.add(nodeAddress);
            _totalNodes++;
        }

        _nodesMap[nodeAddress] = NodeInfo(
            nodeAddress,
            gpuModel,
            vRAM
        );
    }

    function nodeQuit() public {
        require(
            msg.sender == nodeContractAddress,
            "Not called by the node contract"
        );

        _activeNodes--;
        _availableNodes--;
    }

    function nodePaused() public {
        require(
            msg.sender == nodeContractAddress,
            "Not called by the node contract"
        );

        _availableNodes--;
    }

    function nodeResumed() public {
        require(
            msg.sender == nodeContractAddress,
            "Not called by the node contract"
        );

        _availableNodes++;
    }

    function nodeTaskStarted() public {
        require(
            msg.sender == nodeContractAddress,
            "Not called by the node contract"
        );

        _availableNodes--;
        _busyNodes++;
    }

    function nodeTaskFinished() public {
        require(
            msg.sender == nodeContractAddress,
            "Not called by the node contract"
        );

        _availableNodes++;
        _busyNodes--;
    }

    function taskQueued() public {
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        _totalTasks++;
        _queuedTasks++;
    }

    function taskStarted() public {
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        _queuedTasks--;
        _runningTasks++;
    }

    function taskFinished() public {
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        _runningTasks--;
    }
}
