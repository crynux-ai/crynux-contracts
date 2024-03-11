// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./TaskHeap.sol";

contract TaskQueue is Ownable {
    using EnumerableSet for EnumerableSet.UintSet;
    using TaskHeap_impl for TaskHeap;

    address private taskContractAddress;

    uint private count;
    uint private sizeLimit;

    // store task vrams for sd task type and gpt task type
    EnumerableSet.UintSet private sdTaskVrams;
    EnumerableSet.UintSet private gptTaskVrams;

    // store tasks in heap grouped by vrams 
    mapping(uint => TaskHeap) private sdTaskHeaps;
    mapping(uint => TaskHeap) private gptTaskHeaps;

    constructor() {
        sizeLimit = 50;
    }

    function updateTaskContractAddress(address taskContract) public onlyOwner {
        taskContractAddress = taskContract;
    }

    function updateSizeLimit(uint limit) public onlyOwner {
        sizeLimit = limit;
    }

    function pushTask(
        uint taskId,
        uint taskType,
        address creator,
        bytes32 taskHash,
        bytes32 dataHash,
        uint vramLimit,
        uint taskFee,
        uint price
    ) public {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskType == 0 || taskType == 1, "Invalid task type");
        require(count < sizeLimit, "Task queue is full");

        TaskInQueue memory task = TaskInQueue({
            id: taskId,
            taskType: taskType,
            creator: creator,
            taskHash: taskHash,
            dataHash: dataHash,
            vramLimit: vramLimit,
            taskFee: taskFee,
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
        count++;
    }

    function popTask(bool sameGPU, uint vramLimit) public returns (TaskInQueue memory) {
        require(count > 0, "No available task");

        bool isGPT = false;
        uint resultVram = 0;
        uint maxPrice = 0;

        if (sameGPU) {
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
        count--;
        return result;
    }

    function size() public view returns (uint) {
        return count;
    }
}