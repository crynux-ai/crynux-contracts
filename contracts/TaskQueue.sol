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

    // store a node's local model ids for matching with candidate tasks' model ids in popTask
    // need to be cleared after popTask
    EnumerableSet.Bytes32Set private nodeLocalModelIDs;

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
        string[] calldata modelIDs,
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
            modelIDs,
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

    function popTask(string calldata gpuName, uint gpuVRAM, uint[3] calldata version, string[] calldata localModelIDs, string[] calldata lastModelIDs) public returns (bytes32) {
        require(msg.sender == taskContractAddress, "Not called by the task contract");
        require(taskIDCommitments.length() > 0, "No available task");

        bytes32 taskIDCommitment;
        uint maxPrice;
        
        for (uint i = 0; i < localModelIDs.length; i++) {
            nodeLocalModelIDs.add(keccak256(abi.encodePacked(localModelIDs[i])));
        }
        bytes32 lastModelIDsHash = keccak256(abi.encode(lastModelIDs));
        bytes32 gpuID = keccak256(abi.encodePacked(gpuName, gpuVRAM));
        if (gpuIDs.contains(gpuID)) {
            uint price = gpuIDTaskArray[gpuID].maxPrice();
            TaskArray.Task[] memory tasks = gpuIDTaskArray[gpuID].get(price);
            uint maxTaskScore = 0;
            bytes32 localTaskIDCommitment;
            for (uint i = 0; i < tasks.length; i++) {
                uint[3] memory taskVersion = tasks[i].taskVersion;
                uint taskScore = 0;
                if (Version.matchVersion(version, taskVersion)) {
                    taskScore = 1;
                    if (lastModelIDsHash == keccak256(abi.encode(tasks[i].modelIDs))) {
                        maxTaskScore = tasks[i].modelIDs.length;
                        localTaskIDCommitment = tasks[i].taskIDCommitment;
                        break;
                    } else {
                        for (uint j = 0; j < tasks[i].modelIDs.length; j++) {
                            if (nodeLocalModelIDs.contains(keccak256(abi.encodePacked(tasks[i].modelIDs[j])))) {
                                taskScore += 1;
                            }
                        }
                        if (taskScore > maxTaskScore) {
                            maxTaskScore = taskScore;
                            localTaskIDCommitment = tasks[i].taskIDCommitment;
                        }
                    }
                }
            }
            if (maxTaskScore > 0) {
                maxPrice = price;
                taskIDCommitment = localTaskIDCommitment;
            }
        }
        for (uint i = 0; i < vrams.length(); i++) {
            uint taskMinVram = vrams.at(i);
            if (gpuVRAM >= taskMinVram) {
                uint price = vramTaskArray[taskMinVram].maxPrice();
                if (price > maxPrice) {
                    TaskArray.Task[] memory tasks = vramTaskArray[taskMinVram].get(price);
                    uint maxTaskScore = 0;
                    bytes32 localTaskIDCommitment;
                    for (uint j = 0; j < tasks.length; j++) {
                        uint[3] memory taskVersion = tasks[j].taskVersion;
                        uint taskScore = 0;
                        if (Version.matchVersion(version, taskVersion)) {
                            taskScore = 1;
                            if (lastModelIDsHash == keccak256(abi.encode(tasks[j].modelIDs))) {
                                maxTaskScore = tasks[j].modelIDs.length;
                                localTaskIDCommitment = tasks[j].taskIDCommitment;
                                break;
                            } else {
                                for (uint k = 0; k < tasks[j].modelIDs.length; k++) {
                                    if (nodeLocalModelIDs.contains(keccak256(abi.encodePacked(tasks[j].modelIDs[k])))) {
                                        taskScore += 1;
                                    }
                                }
                                if (taskScore > maxTaskScore) {
                                    maxTaskScore = taskScore;
                                    localTaskIDCommitment = tasks[j].taskIDCommitment;
                                }
                            }
                        }
                    }
                    if (maxTaskScore > 0) {
                        maxPrice = price;
                        taskIDCommitment = localTaskIDCommitment;
                    }
                }
            }
        }
        for (uint i = 0; i < localModelIDs.length; i++) {
            nodeLocalModelIDs.remove(keccak256(abi.encodePacked(localModelIDs[i])));
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
            delete taskGPUIDs[taskIDCommitment];
        } else {
            uint vram = taskVrams[taskIDCommitment];
            vramTaskArray[vram].remove(taskIDCommitment);
            if (vramTaskArray[vram].length() == 0) {
                delete vramTaskArray[vram];
                vrams.remove(vram);
            }
        }
        delete taskVrams[taskIDCommitment];
        taskIDCommitments.remove(taskIDCommitment);
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
