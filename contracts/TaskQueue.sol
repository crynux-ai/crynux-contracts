// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./libs/TaskArray.sol";
import "./libs/Version.sol";

contract TaskQueue is Ownable {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using TaskArray for TaskArray.TArray;

    address private taskContractAddress;

    uint private sizeLimit;

    // store all task id commitments
    EnumerableSet.Bytes32Set private taskIDCommitments;
    mapping (bytes32 => uint) taskVrams;
    mapping (bytes32 => bytes32) taskGPUIDs;
    // store gpu vram for tasks that don't specify requiredGPU
    EnumerableSet.UintSet private vrams;
    // store gpu id for tasks that specify requiredGPU
    EnumerableSet.Bytes32Set private gpuIDs;

    // task array for tasks that that don't specify requiredGPU
    mapping(uint => TaskArray.TArray) private vramTaskArray;
    // task array for tasks that that specify requiredGPU
    mapping(bytes32 => TaskArray.TArray) private gpuIDTaskArray;

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
        return taskIDCommitments.length();
    }

    function getSizeLimit() public view returns (uint) {
        return sizeLimit;
    }

    function include(bytes32 taskIDCommitment) public view returns (bool) {
        return taskIDCommitments.contains(taskIDCommitment);
    }

    function pushTask(
        bytes32 taskIDCommitment,
        uint taskFee,
        uint taskSize,
        string calldata modelID,
        uint minimumVRAM,
        string calldata requiredGPU,
        uint requiredGPUVRAM,
        uint[3] calldata taskVersion
    ) public {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskIDCommitments.length() < sizeLimit, "Task queue is full");

        TaskArray.Task memory task = TaskArray.Task(
            taskIDCommitment,
            taskFee,
            taskSize,
            modelID,
            minimumVRAM,
            requiredGPU,
            requiredGPUVRAM,
            taskVersion
        );

        taskIDCommitments.add(taskIDCommitment);
        taskVrams[taskIDCommitment] = minimumVRAM;
        if (bytes(requiredGPU).length > 0) {
            bytes32 gpuID = keccak256(abi.encodePacked(requiredGPU, requiredGPUVRAM));
            taskGPUIDs[taskIDCommitment] = gpuID;
            gpuIDs.add(gpuID);
            gpuIDTaskArray[gpuID].add(task);
        } else {
            vrams.add(minimumVRAM);
            vramTaskArray[minimumVRAM].add(task);
        }
    }

    function popTask(string calldata gpuName, uint gpuVRAM, uint[3] calldata version, string calldata lastModelID) public returns (bytes32) {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskIDCommitments.length() > 0, "No available task");

        bytes32 taskIDCommitment;
        uint maxPrice;

        bytes32 gpuID = keccak256(abi.encodePacked(gpuName, gpuVRAM));
        if (gpuIDs.contains(gpuID)) {
            uint price = gpuIDTaskArray[gpuID].maxPrice();
            TaskArray.Task[] memory tasks = gpuIDTaskArray[gpuID].get(price);
            // task id commitment which only match the task version
            bytes32 secondTaskIDCommitment;
            for (uint i = 0; i < tasks.length; i++) {
                uint[3] memory taskVersion = tasks[i].taskVersion;
                if (Version.matchVersion(version, taskVersion)) {
                    if (uint(secondTaskIDCommitment) == 0) {
                        secondTaskIDCommitment = tasks[i].taskIDCommitment;
                    }
                    if (keccak256(bytes(lastModelID)) == keccak256(bytes(tasks[i].modelID))) {
                        taskIDCommitment = tasks[i].taskIDCommitment;
                        break;
                    }
                }
            }
            if (uint(taskIDCommitment) == 0 && uint(secondTaskIDCommitment) != 0) {
                taskIDCommitment = secondTaskIDCommitment;
            }
            if (uint(taskIDCommitment) != 0) {
                maxPrice = price;
            }
        } else {
            for (uint i = 0; i < vrams.length(); i++) {
                uint taskMinVram = vrams.at(i);
                if (gpuVRAM >= taskMinVram) {
                    uint price = vramTaskArray[taskMinVram].maxPrice();
                    if (price > maxPrice) {
                        TaskArray.Task[] memory tasks = vramTaskArray[taskMinVram].get(price);
                        // task id commitment which only match the task version
                        bytes32 secondTaskIDCommitment;
                        for (uint j = 0; j < tasks.length; j++) {
                            uint[3] memory taskVersion = tasks[i].taskVersion;
                            if (Version.matchVersion(version, taskVersion)) {
                                if (uint(secondTaskIDCommitment) == 0) {
                                    secondTaskIDCommitment = tasks[j].taskIDCommitment;
                                }
                                if (keccak256(bytes(lastModelID)) == keccak256(bytes(tasks[j].modelID))) {
                                    taskIDCommitment = tasks[j].taskIDCommitment;
                                    break;
                                }
                            }
                        }
                        if (uint(taskIDCommitment) == 0 && uint(secondTaskIDCommitment) != 0) {
                            taskIDCommitment = secondTaskIDCommitment;
                        }
                        if (uint(taskIDCommitment) != 0) {
                            maxPrice = price;
                        }
                    }
                }
            }
        }

        _removeTask(taskIDCommitment);
        return taskIDCommitment;
    }

    function _removeTask(bytes32 taskIDCommitment) internal {
        bytes32 gpuID = taskGPUIDs[taskIDCommitment];
        if (uint(gpuID) != 0) {
            gpuIDTaskArray[gpuID].remove(taskIDCommitment);
            if (gpuIDTaskArray[gpuID].length() == 0) {
                delete gpuIDTaskArray[gpuID];
                gpuIDs.remove(gpuID);
            }
        }
        uint vram = taskVrams[taskIDCommitment];
        vramTaskArray[vram].remove(taskIDCommitment);
        if (vramTaskArray[vram].length() == 0) {
            delete vramTaskArray[vram];
            vrams.remove(vram);
        }
        taskIDCommitments.remove(taskIDCommitment);
        delete taskGPUIDs[taskIDCommitment];
        delete taskVrams[taskIDCommitment];
    }

    function removeTask(bytes32 taskIDCommitment) public {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskIDCommitments.contains(taskIDCommitment), "Task not in queue");
        _removeTask(taskIDCommitment);
    }

    function getCheapestTask() public view returns (bytes32) {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskIDCommitments.length() > 0, "No available task");
        
        // find cheapest task id commitment
        bytes32 taskIDCommitment;
        uint minPrice = 0;
        for (uint i = 0; i < vrams.length(); i++) {
            uint vram = vrams.at(i);
            uint price = vramTaskArray[vram].minPrice();
            if (minPrice == 0 || price < minPrice) {
                TaskArray.Task[] memory tasks = vramTaskArray[vram].get(price);
                taskIDCommitment = tasks[0].taskIDCommitment;
                minPrice = price;
            }
        }
        for (uint i = 0; i < gpuIDs.length(); i++) {
            bytes32 gpuID = gpuIDs.at(i);
            uint price = gpuIDTaskArray[gpuID].minPrice();
            if (minPrice == 0 || price < minPrice) {
                TaskArray.Task[] memory tasks = gpuIDTaskArray[gpuID].get(price);
                taskIDCommitment = tasks[0].taskIDCommitment;
                minPrice = price;
            }
        }
        return taskIDCommitment;
    }
}
