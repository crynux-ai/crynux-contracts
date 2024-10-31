// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./TaskHeap.sol";

contract TaskQueue is Ownable {
    using EnumerableSet for EnumerableSet.UintSet;
    using TaskMaxHeap_impl for TaskMaxHeap;
    using TaskMinHeap_impl for TaskMinHeap;

    address private taskContractAddress;

    uint private sizeLimit;

    // store task vrams for sd task type and gpt task type
    EnumerableSet.UintSet private sdTaskVrams;
    EnumerableSet.UintSet private gptTaskVrams;

    // store tasks in heap grouped by vrams
    mapping(uint => TaskMaxHeap) private sdTaskHeaps;
    mapping(uint => TaskMaxHeap) private gptTaskHeaps;
    // store sd finetune tasks in heap grouped by gpu id
    mapping(bytes32 => TaskMaxHeap) private sdFtTaskHeaps;

    // store all tasks in min heap, useful for removing the cheapest task when the task queue is full
    TaskMinHeap private taskHeap;

    constructor() Ownable(msg.sender) {
        sizeLimit = 50;
    }

    function updateTaskContractAddress(address taskContract) public onlyOwner {
        taskContractAddress = taskContract;
    }

    function updateSizeLimit(uint limit) public onlyOwner {
        sizeLimit = limit;
    }

    function size() public view returns (uint) {
        return taskHeap.size();
    }

    function getSizeLimit() public view returns (uint) {
        return sizeLimit;
    }

    function include(uint taskId) public view returns (bool) {
        return taskHeap.include(taskId);
    }

    function pushTask(
        uint taskId,
        uint taskType,
        address creator,
        bytes32 taskHash,
        bytes32 dataHash,
        uint vramLimit,
        uint taskFee,
        uint price,
        bytes32 gpuID
    ) public {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskType == 0 || taskType == 1 || taskType == 2, "Invalid task type");
        require(taskHeap.size() < sizeLimit, "Task queue is full");

        TaskInQueue memory task = TaskInQueue({
            id: taskId,
            taskType: taskType,
            creator: creator,
            taskHash: taskHash,
            dataHash: dataHash,
            vramLimit: vramLimit,
            taskFee: taskFee,
            price: price,
            gpuID: gpuID
        });
        if (taskType == 0) {
            // sd task
            sdTaskVrams.add(vramLimit);
            sdTaskHeaps[vramLimit].insert(task);
        } else if (taskType == 1) {
            gptTaskVrams.add(vramLimit);
            gptTaskHeaps[vramLimit].insert(task);
        } else if (taskType == 2) {
            sdFtTaskHeaps[gpuID].insert(task);
        }
        taskHeap.insert(task);
    }

    function popTask(bool sameGPU, uint vramLimit, bytes32 gpuID) public returns (TaskInQueue memory) {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskHeap.size() > 0, "No available task");

        TaskMaxHeap storage resultHeap = sdFtTaskHeaps[0];
        uint maxPrice = 0;

        if (sameGPU) {
            if (sdFtTaskHeaps[gpuID].size() > 0) {
                TaskInQueue memory task = sdFtTaskHeaps[gpuID].top();
                if (task.price > maxPrice) {
                    maxPrice = task.price;
                    resultHeap = sdFtTaskHeaps[gpuID];
                }
            }

            for (uint i = 0; i < gptTaskVrams.length(); i++) {
                uint vram = gptTaskVrams.at(i);
                if (vram <= vramLimit) {
                    TaskInQueue memory task = gptTaskHeaps[vram].top();
                    if (task.price > maxPrice) {
                        maxPrice = task.price;
                        resultHeap = gptTaskHeaps[vram];
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
                    resultHeap = sdTaskHeaps[vram];
                }
            }
        }

        require(maxPrice > 0, "No available task");

        TaskInQueue memory result = resultHeap.pop();
        if (resultHeap.size() == 0) {
            if (result.taskType == 0) {
                delete sdTaskHeaps[result.vramLimit];
                sdTaskVrams.remove(result.vramLimit);
            } else if (result.taskType == 1) {
                delete gptTaskHeaps[result.vramLimit];
                gptTaskVrams.remove(result.vramLimit);
            } else if (result.taskType == 2) {
                delete sdFtTaskHeaps[result.gpuID];
            }
        }
        taskHeap.remove(result.id);
        return result;
    }

    function removeTask(uint taskId) public returns (TaskInQueue memory) {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskHeap.include(taskId), "Task is not in queue");

        TaskInQueue memory task = taskHeap.remove(taskId);
        if (task.taskType == 0) {
            sdTaskHeaps[task.vramLimit].remove(taskId);
            if (sdTaskHeaps[task.vramLimit].size() == 0) {
                delete sdTaskHeaps[task.vramLimit];
                sdTaskVrams.remove(task.vramLimit);
            }
        } else {
            gptTaskHeaps[task.vramLimit].remove(taskId);
            if (gptTaskHeaps[task.vramLimit].size() == 0) {
                delete gptTaskHeaps[task.vramLimit];
                gptTaskVrams.remove(task.vramLimit);
            }
        }

        return task;
    }

    function removeCheapestTask() public returns (TaskInQueue memory) {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskHeap.size() > 0, "No available task");

        TaskInQueue memory task = taskHeap.pop();
        if (task.taskType == 0) {
            sdTaskHeaps[task.vramLimit].remove(task.id);
            if (sdTaskHeaps[task.vramLimit].size() == 0) {
                delete sdTaskHeaps[task.vramLimit];
                sdTaskVrams.remove(task.vramLimit);
            }
        } else {
            gptTaskHeaps[task.vramLimit].remove(task.id);
            if (gptTaskHeaps[task.vramLimit].size() == 0) {
                delete gptTaskHeaps[task.vramLimit];
                gptTaskVrams.remove(task.vramLimit);
            }
        }

        return task;
    }
}
