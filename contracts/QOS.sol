// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";

contract QOS is Ownable {
    // task score reward for first, second and third submissions
    uint[3] private TASK_SCORE_REWARDS = [10, 9, 6];

    uint constant private TASK_SCORE_POOL_SIZE = 3;

    address private nodeContractAddress;
    address private taskContractAddress;

    // node total task count
    mapping(address => uint) private nodeTaskCount;
    // node total task score
    mapping(address => uint) private nodeTaskScore;
    // node recent task scores pool, used for check if a node should be kicked out
    // the pool size is TASK_SCORE_POOL_SIZE
    // the first position of pool is the current node task score
    mapping(address => uint[TASK_SCORE_POOL_SIZE]) private nodeTaskScorePool;

    uint private kickoutThreshold;

    constructor() {
        kickoutThreshold = 20;
    }

    function updateNodeContractAddress(address nodeContract) public onlyOwner {
        nodeContractAddress = nodeContract;
    }

    function updateTaskContractAddress(address taskContract) public onlyOwner {
        taskContractAddress = taskContract;
    }

    function updateKickoutThreshold(uint threshold) public onlyOwner {
        kickoutThreshold = threshold;
    }

    function startTask(address nodeAddress) public {
        require(
            msg.sender == nodeContractAddress,
            "Not called by the node contract"
        );

        nodeTaskCount[nodeAddress]++;
        // right shift the nodeTaskScorePool
        for (uint i = TASK_SCORE_POOL_SIZE - 1; i > 0; i--) {
            nodeTaskScorePool[nodeAddress][i] = nodeTaskScorePool[nodeAddress][i - 1];
        }
        nodeTaskScorePool[nodeAddress][0] = 0;
    }

    function finishTask(address nodeAddress) public {
        require(
            msg.sender == nodeContractAddress,
            "Not called by the node contract"
        );

        // add current node task score to total node task score
        nodeTaskScore[nodeAddress] += nodeTaskScorePool[nodeAddress][0];
    }

    function addTaskScore(address nodeAddress, uint i) public {
        // add node score when node submit commitment and disclose task
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        require(i < 3, "Invalid index");

        // add commitment score to current node task score
        nodeTaskScorePool[nodeAddress][0] += TASK_SCORE_REWARDS[i];
    }

    function punish(address nodeAddress) public {
        // clear node task score when it is slashed
        require(
            msg.sender == taskContractAddress,
            "Not called by the task contract"
        );

        nodeTaskScorePool[nodeAddress][0] = 0;
    }

    function getTaskScore(address nodeAddress) public view returns (uint) {
        if (nodeTaskCount[nodeAddress] == 0) {
            return 14;
        } else {
            return nodeTaskScore[nodeAddress] / nodeTaskCount[nodeAddress];
        }
    }

    function getRecentTaskScore(address nodeAddress) public view returns (uint) {
        uint totalScore = 0;
        for (uint i = 0; i < TASK_SCORE_POOL_SIZE; i++) {
            totalScore += nodeTaskScorePool[nodeAddress][i];
        }

        return totalScore;
    }

    function getCurrentTaskScore(address nodeAddress) public view returns (uint) {
        return nodeTaskScorePool[nodeAddress][0];
    }

    function shouldKickOut(address nodeAddress) public view returns (bool) {
        uint totalScore = 0;
        uint taskCount = nodeTaskCount[nodeAddress];
        if (taskCount < TASK_SCORE_POOL_SIZE) {
            totalScore += (TASK_SCORE_POOL_SIZE - taskCount) * TASK_SCORE_REWARDS[0] * 2;
        }

        for (uint i = 0; i < TASK_SCORE_POOL_SIZE; i++) {
            totalScore += nodeTaskScorePool[nodeAddress][i];
        }

        return totalScore <= kickoutThreshold;
    }

    function getTaskScoreLimit() public view returns (uint) {
        return (TASK_SCORE_REWARDS[0] + TASK_SCORE_REWARDS[1] + TASK_SCORE_REWARDS[2]) * 2;
    }
}