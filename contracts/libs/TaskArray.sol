// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Arrays.sol";
import "./Heap.sol";

library TaskArray {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using UniqueHeap for UniqueHeap.MaxUintUniqueHeap;
    using UniqueHeap for UniqueHeap.MinUintUniqueHeap;

    struct Task {
        bytes32 taskIDCommitment;
        uint taskFee;
        uint taskSize;
        string[] modelIDs;
        uint minimumVRAM;
        string requiredGPU;
        uint requiredGPUVRAM;
        uint[3] taskVersion;
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
        // mapping from task id commitment to price
        mapping(bytes32 => uint) taskPriceMap;
        // task price max heap, used to get max price
        UniqueHeap.MaxUintUniqueHeap maxPriceHeap;
        // task price min heap, used to get min price
        UniqueHeap.MinUintUniqueHeap minPriceHeap;
    }

    function add(TArray storage arr, Task memory task) internal {
        uint price = task.taskFee / task.taskSize;
        arr.taskIDCommitmentSet.add(task.taskIDCommitment);
        arr.taskPriceMap[task.taskIDCommitment] = price;
        arr.taskGroupNodes[price].tasks[task.taskIDCommitment] = task;
        arr.taskGroupNodes[price].taskIDCommitmentSet.add(
            task.taskIDCommitment
        );
        arr.maxPriceHeap.push(price);
        arr.minPriceHeap.push(price);
    }

    function contains(
        TArray storage arr,
        bytes32 taskIDCommitment
    ) internal view returns (bool) {
        return arr.taskIDCommitmentSet.contains(taskIDCommitment);
    }

    function remove(TArray storage arr, bytes32 taskIDCommitment) internal {
        if (contains(arr, taskIDCommitment)) {
            arr.taskIDCommitmentSet.remove(taskIDCommitment);
            uint price = arr.taskPriceMap[taskIDCommitment];
            delete arr.taskPriceMap[taskIDCommitment];

            delete arr.taskGroupNodes[price].tasks[taskIDCommitment];
            arr.taskGroupNodes[price].taskIDCommitmentSet.remove(
                taskIDCommitment
            );

            if (arr.taskGroupNodes[price].taskIDCommitmentSet.length() == 0) {
                delete arr.taskGroupNodes[price];
                // remove price from arr.taskPrices
                arr.maxPriceHeap.remove(price);
                arr.minPriceHeap.remove(price);
            }
        } else {
            revert("No such task");
        }
    }

    function get(
        TArray storage arr,
        uint price
    ) internal view returns (Task[] memory) {
        if (arr.maxPriceHeap.contains(price)) {
            uint l = arr.taskGroupNodes[price].taskIDCommitmentSet.length();
            Task[] memory tasks = new Task[](l);
            for (uint i = 0; i < l; i++) {
                bytes32 taskIDCommitment = arr
                    .taskGroupNodes[price]
                    .taskIDCommitmentSet
                    .at(i);
                tasks[i] = arr.taskGroupNodes[price].tasks[taskIDCommitment];
            }
            return tasks;
        } else {
            revert("No such price");
        }
    }

    function minPrice(TArray storage arr) internal view returns (uint) {
        if (arr.minPriceHeap.size() > 0) {
            return arr.minPriceHeap.top();
        } else {
            revert("Task array is empty");
        }
    }

    function maxPrice(TArray storage arr) internal view returns (uint) {
        if (arr.maxPriceHeap.size() > 0) {
            return arr.maxPriceHeap.top();
        } else {
            revert("Task array is empty");
        }
    }

    function length(TArray storage arr) internal view returns (uint) {
        return arr.taskIDCommitmentSet.length();
    }
}
