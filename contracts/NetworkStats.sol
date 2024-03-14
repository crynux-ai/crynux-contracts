// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract NetworkStats {

    using EnumerableSet for EnumerableSet.AddressSet;

    struct NodeInfo {
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

        _activeNodes++;
        _availableNodes++;

        if(!_allNodes.contains(nodeAddress)) {
            _allNodes.add(nodeAddress);
            _totalNodes++;
        }

        _nodesMap[nodeAddress] = NodeInfo(
            gpuModel,
            vRAM
        );
    }

    function nodeQuit() public {
        _activeNodes--;
        _availableNodes--;
    }

    function nodePaused() public {
        _availableNodes--;
    }

    function nodeResumed() public {
        _availableNodes++;
    }

    function nodeTaskStarted() public {
        _availableNodes--;
        _busyNodes++;
    }

    function nodeTaskFinished() public {
        _availableNodes++;
        _busyNodes--;
    }

    function taskQueued() public {
        _totalTasks++;
        _queuedTasks++;
    }

    function taskStarted() public {
        _queuedTasks--;
        _runningTasks++;
    }

    function taskFinished() public {
        _runningTasks--;
    }
}
