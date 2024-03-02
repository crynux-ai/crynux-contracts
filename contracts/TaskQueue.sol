// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./Node.sol";

struct TaskInQueue {
    uint256 id;
    uint taskType;
    address creator;
    bytes32 taskHash;
    bytes32 dataHash;
    uint vramLimit;
    uint price;
}

struct TaskHeap {
    TaskInQueue[] tasks;
}

library TaskHeap_impl {
    function insert(TaskHeap storage heap, TaskInQueue memory task) internal {
        heap.tasks.push(task);
        uint index = heap.tasks.length - 1;
        for (; index > 0 && task.price > heap.tasks[(index - 1) / 2].price; index = (index - 1) / 2) {
            heap.tasks[index] = heap.tasks[(index - 1) / 2];
        }
        heap.tasks[index] = task;
    }

    function size(TaskHeap storage heap) internal view returns (uint) {
        return heap.tasks.length;
    }

    function top(TaskHeap storage heap) internal view returns (TaskInQueue memory) {
        return heap.tasks[0];
    }

    function pop(TaskHeap storage heap) internal {
        TaskInQueue memory last = heap.tasks[heap.tasks.length - 1];

        heap.tasks.pop();

        uint index = 0;
        while (2 * index + 1 < heap.tasks.length) {
            uint nextIndex = 2 * index + 1;
            if (nextIndex + 1 < heap.tasks.length && heap.tasks[nextIndex + 1].price > heap.tasks[nextIndex].price) {
                nextIndex++;
            }
            if (last.price >= heap.tasks[nextIndex].price) {
                break;
            }
            heap.tasks[index] = heap.tasks[nextIndex];
            index = nextIndex;
        }
        heap.tasks[index] = last;
    }
}

contract TaskQueue is Ownable {
    using EnumerableSet for EnumerableSet.UintSet;
    using TaskHeap_impl for TaskHeap;

    Node node;

    address private taskContractAddress;

    // store task vrams for sd task type and gpt task type
    EnumerableSet.UintSet private sdTaskVrams;
    EnumerableSet.UintSet private gptTaskVrams;

    // store tasks in heap grouped by vrams 
    mapping(uint => TaskHeap) private sdTaskHeaps;
    mapping(uint => TaskHeap) private gptTaskHeaps;

    constructor(Node nodeInstance) {
        node = nodeInstance;
    }

    function updateTaskContractAddress(address taskContract) public onlyOwner {
        taskContractAddress = taskContract;
    }

    function pushTask(
        uint taskId,
        uint taskType,
        address creator,
        bytes32 taskHash,
        bytes32 dataHash,
        uint vramLimit,
        uint price
    ) public {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskType == 0 || taskType == 1, "Invalid task type");

        TaskInQueue memory task = TaskInQueue({
            id: taskId,
            taskType: taskType,
            creator: creator,
            taskHash: taskHash,
            dataHash: dataHash,
            vramLimit: vramLimit,
            price: price
        });
        if (taskType == 0) {
            // sd task
            sdTaskVrams.add(vramLimit);
            sdTaskHeaps[vramLimit].insert(task);
        } else {
            gptTaskVrams.add(vramLimit);
            gptTaskHeaps[vramLimit].insert(task);
        }
    }

    function popTask(address node1, address node2, address node3) public returns (TaskInQueue memory) {
        Node.NodeInfo memory nodeInfo1 = node.getNodeInfo(node1);
        Node.NodeInfo memory nodeInfo2 = node.getNodeInfo(node2);
        Node.NodeInfo memory nodeInfo3 = node.getNodeInfo(node3);

        bool isGPT = false;
        uint resultVram = 0;
        uint maxPrice = 0;

        uint vramLimit = nodeInfo1.gpu.vram;

        if (nodeInfo1.gpuID == nodeInfo2.gpuID && nodeInfo1.gpuID == nodeInfo3.gpuID) {
            for (uint i = 0; i < gptTaskVrams.length(); i++) {
                uint vram = gptTaskVrams.at(i);
                if (vram <= vramLimit) {
                    TaskInQueue memory task = gptTaskHeaps[vram].top();
                    if (task.price > maxPrice) {
                        maxPrice = task.price;
                        resultVram = vram;
                        isGPT = true;
                    }
                }
            }
        }
        if (nodeInfo2.gpu.vram < vramLimit) {
            vramLimit = nodeInfo2.gpu.vram;
        }
        if (nodeInfo3.gpu.vram < vramLimit) {
            vramLimit = nodeInfo3.gpu.vram;
        }

        for (uint i = 0; i < sdTaskVrams.length(); i++) {
            uint vram = sdTaskVrams.at(i);
            if (vram <= vramLimit) {
                TaskInQueue memory task = sdTaskHeaps[vram].top();
                if (task.price > maxPrice) {
                    maxPrice = task.price;
                    resultVram = vram;
                    isGPT = false;
                }
            }
        }

        require(maxPrice > 0, "No available task");

        TaskInQueue memory result;
        if (isGPT) {
            result = gptTaskHeaps[resultVram].top();
            gptTaskHeaps[resultVram].pop();
            if (gptTaskHeaps[resultVram].size() == 0) {
                delete gptTaskHeaps[resultVram];
                gptTaskVrams.remove(resultVram);
            }
        } else {
            result = sdTaskHeaps[resultVram].top();
            sdTaskHeaps[resultVram].pop();
            if (sdTaskHeaps[resultVram].size() == 0) {
                delete sdTaskHeaps[resultVram];
                sdTaskVrams.remove(resultVram);
            }
        }
        return result;
    }
}