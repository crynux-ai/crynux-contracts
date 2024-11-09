// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Arrays.sol";

library TaskArray {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    
    struct Task {
        bytes32 taskIDCommitment;
        uint taskFee;
        uint taskSize;
        string modelID;
        uint minimumVRAM;
        string requiredGPU;
        uint requiredGPUVRAM;
        string taskVersion;
    }

    // tasks with the same price
    struct TaskGroup {
        mapping(bytes32 => Task) tasks;
        EnumerableSet.Bytes32Set taskIDCommitmentSet;
    }

    struct TArray {
        // mapping from task price to TaskGroupNode
        mapping(uint => TaskGroup) taskGroupNodes;
        // store all taskIDCommitments
        EnumerableSet.Bytes32Set taskIDCommitmentSet;
        mapping (bytes32 => uint) taskPriceMap;
        // store all task prices
        EnumerableSet.UintSet taskPriceSet;
        // task prices array, used for binary search position of new added task
        uint[] taskPrices;
    }

    function add(TArray storage arr, Task memory task) internal {
        uint price = task.taskFee / task.taskSize;
        arr.taskIDCommitmentSet.add(task.taskIDCommitment);
        arr.taskPriceMap[task.taskIDCommitment] = price;
        arr.taskGroupNodes[price].tasks[task.taskIDCommitment] = task;
        arr.taskGroupNodes[price].taskIDCommitmentSet.add(task.taskIDCommitment);

        if (!arr.taskPriceSet.contains(price)) {
            arr.taskPriceSet.add(price);
            uint loc = Arrays.findUpperBound(arr.taskPrices, price);
            arr.taskPrices.push(price);
            for (uint i = arr.taskPrices.length; i > loc; i--) {
                arr.taskPrices[i] = arr.taskPrices[i - 1];
            }
            arr.taskPrices[loc] = price;
        } 
    }

    function contains(TArray storage arr, bytes32 taskIDCommitment) internal view returns (bool) {
        return arr.taskIDCommitmentSet.contains(taskIDCommitment);
    }

    function remove(TArray storage arr, bytes32 taskIDCommitment) internal {
        if (contains(arr, taskIDCommitment)) {
            arr.taskIDCommitmentSet.remove(taskIDCommitment);
            uint price = arr.taskPriceMap[taskIDCommitment];
            delete arr.taskPriceMap[taskIDCommitment];

            delete arr.taskGroupNodes[price].tasks[taskIDCommitment];
            arr.taskGroupNodes[price].taskIDCommitmentSet.remove(taskIDCommitment);

            if (arr.taskGroupNodes[price].taskIDCommitmentSet.length() == 0) {
                delete arr.taskGroupNodes[price];
                arr.taskPriceSet.remove(price);
                // remove price from arr.taskPrices
                uint loc = 0;
                for (; loc < arr.taskPrices.length && arr.taskPrices[loc] != price; loc++) {}
                for (; loc < arr.taskPrices.length - 1; loc++) {
                    arr.taskPrices[loc] = arr.taskPrices[loc + 1];
                }
                arr.taskPrices.pop();
            }
        } else {
            revert("No such task");
        }
    }

    function get(TArray storage arr, uint price) internal view returns (Task[] memory) {
        if (arr.taskPriceSet.contains(price)) {
            uint l = arr.taskGroupNodes[price].taskIDCommitmentSet.length();
            Task[] memory tasks = new Task[](l);
            for (uint i = 0; i < l; i++) {
                bytes32 taskIDCommitment = arr.taskGroupNodes[price].taskIDCommitmentSet.at(i);
                tasks[i] = arr.taskGroupNodes[price].tasks[taskIDCommitment];
            }
            return tasks;
        } else {
            revert("No such price");
        }
    }

    function minPrice(TArray storage arr) internal view returns (uint) {
        if (arr.taskPrices.length > 0) {
            return arr.taskPrices[0];
        } else {
            revert("Task array is empty");
        }
    }

    function maxPrice(TArray storage arr) internal view returns (uint) {
        if (arr.taskPrices.length > 0) {
            return arr.taskPrices[arr.taskPrices.length - 1];
        } else {
            revert("Task array is empty");
        }
    }

    function length(TArray storage arr) internal view returns (uint) {
        return arr.taskIDCommitmentSet.length();
    }
}