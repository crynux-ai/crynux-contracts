// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

library Heap {
    struct UintKV {
        uint key;
        uint value;
    }

    struct MaxUintToUintKVHeap {
        UintKV[] data;
    }

    function push(MaxUintToUintKVHeap storage heap, uint key, uint value) internal {
        if (heap.data.length == 0) {
            heap.data.push(UintKV(0, 0));
        }
        heap.data.push(UintKV(key, value));
        uint index = heap.data.length - 1;
        for (; index > 1 && value > heap.data[index / 2].value; index /= 2) {
            heap.data[index] = heap.data[index / 2];
        }
        heap.data[index] = UintKV(key, value);
    }

    function top(MaxUintToUintKVHeap storage heap) internal view returns (uint, uint) {
        require(heap.data.length > 1, "Heap is empty");
        uint key = heap.data[1].key;
        uint value = heap.data[1].value;
        return (key, value);
    }

    function size(MaxUintToUintKVHeap storage heap) internal view returns (uint) {
        if (heap.data.length == 0) {
            return 0;
        }
        return heap.data.length - 1;
    }

    function pop(MaxUintToUintKVHeap storage heap) internal returns (uint, uint) {
        require(heap.data.length > 1, "heap is empty");

        uint resKey = heap.data[1].key;
        uint resValue = heap.data[1].value;
        uint lastKey = heap.data[heap.data.length - 1].key;
        uint lastValue = heap.data[heap.data.length - 1].value;

        uint index = 1;
        while (index * 2 < heap.data.length) {
            uint nextIndex = index * 2;
            if (nextIndex + 1 < heap.data.length && heap.data[nextIndex].value < heap.data[nextIndex + 1].value) {
                nextIndex++;
            }
            if (heap.data[nextIndex].value > lastValue) {
                heap.data[index] = heap.data[nextIndex];
                index = nextIndex;
            } else {
                break;
            }
        }
        heap.data[index] = UintKV(lastKey, lastValue);
        heap.data.pop();

        return (resKey, resValue);
    }

    struct MinUintToUintKVHeap {
        UintKV[] data;
    }

    function push(MinUintToUintKVHeap storage heap, uint key, uint value) internal {
        if (heap.data.length == 0) {
            heap.data.push(UintKV(0, 0));
        }
        heap.data.push(UintKV(key, value));
        uint index = heap.data.length - 1;
        for (; index > 1 && value < heap.data[index / 2].value; index /= 2) {
            heap.data[index] = heap.data[index / 2];
        }
        heap.data[index] = UintKV(key, value);
    }

    function top(MinUintToUintKVHeap storage heap) internal view returns (uint, uint) {
        require(heap.data.length > 1, "Heap is empty");
        uint key = heap.data[1].key;
        uint value = heap.data[1].value;
        return (key, value);
    }

    function size(MinUintToUintKVHeap storage heap) internal view returns (uint) {
        if (heap.data.length == 0) {
            return 0;
        }
        return heap.data.length - 1;
    }

    function pop(MinUintToUintKVHeap storage heap) internal returns (uint, uint) {
        require(heap.data.length > 1, "heap is empty");

        uint resKey = heap.data[1].key;
        uint resValue = heap.data[1].value;
        uint lastKey = heap.data[heap.data.length - 1].key;
        uint lastValue = heap.data[heap.data.length - 1].value;

        uint index = 1;
        while (index * 2 < heap.data.length) {
            uint nextIndex = index * 2;
            if (nextIndex + 1 < heap.data.length && heap.data[nextIndex].value > heap.data[nextIndex + 1].value) {
                nextIndex++;
            }
            if (heap.data[nextIndex].value < lastValue) {
                heap.data[index] = heap.data[nextIndex];
                index = nextIndex;
            } else {
                break;
            }
        }
        heap.data[index] = UintKV(lastKey, lastValue);
        heap.data.pop();

        return (resKey, resValue);
    }

    struct MaxUintHeap {
        uint[] data;
    }

    function push(MaxUintHeap storage heap, uint value) internal {
        if (heap.data.length == 0) {
            heap.data.push(0);
        }
        heap.data.push(value);
        uint index = heap.data.length - 1;
        for (; index > 1 && value > heap.data[index / 2]; index /= 2) {
            heap.data[index] = heap.data[index / 2];
        }
        heap.data[index] = value;
    }

    function top(MaxUintHeap storage heap) internal view returns (uint) {
        require(heap.data.length > 1, "Heap is empty");
        return heap.data[1];
    }

    function size(MaxUintHeap storage heap) internal view returns (uint) {
        if (heap.data.length == 0) {
            return 0;
        }
        return heap.data.length - 1;
    }

    function pop(MaxUintHeap storage heap) internal returns (uint) {
        require(heap.data.length > 1, "heap is empty");

        uint res = heap.data[1];
        uint last = heap.data[heap.data.length - 1];

        uint index = 1;
        while (index * 2 < heap.data.length) {
            uint nextIndex = index * 2;
            if (nextIndex + 1 < heap.data.length && heap.data[nextIndex] < heap.data[nextIndex + 1]) {
                nextIndex++;
            }
            if (heap.data[nextIndex] > last) {
                heap.data[index] = heap.data[nextIndex];
                index = nextIndex;
            } else {
                break;
            }
        }
        heap.data[index] = last;
        heap.data.pop();

        return res;
    }

    struct MinUintHeap {
        uint[] data;
    }

    function push(MinUintHeap storage heap, uint value) internal {
        if (heap.data.length == 0) {
            heap.data.push(0);
        }
        heap.data.push(value);
        uint index = heap.data.length - 1;
        for (; index > 1 && value < heap.data[index / 2]; index /= 2) {
            heap.data[index] = heap.data[index / 2];
        }
        heap.data[index] = value;
    }

    function top(MinUintHeap storage heap) internal view returns (uint) {
        require(heap.data.length > 1, "Heap is empty");
        return heap.data[1];
    }

    function size(MinUintHeap storage heap) internal view returns (uint) {
        if (heap.data.length == 0) {
            return 0;
        }
        return heap.data.length - 1;
    }

    function pop(MinUintHeap storage heap) internal returns (uint) {
        require(heap.data.length > 1, "heap is empty");

        uint res = heap.data[1];
        uint last = heap.data[heap.data.length - 1];

        uint index = 1;
        while (index * 2 < heap.data.length) {
            uint nextIndex = index * 2;
            if (nextIndex + 1 < heap.data.length && heap.data[nextIndex] > heap.data[nextIndex + 1]) {
                nextIndex++;
            }
            if (heap.data[nextIndex] < last) {
                heap.data[index] = heap.data[nextIndex];
                index = nextIndex;
            } else {
                break;
            }
        }
        heap.data[index] = last;
        heap.data.pop();

        return res;
    }
}

library UniqueHeap {
    // element in heap should be unique
    struct MaxUintUniqueHeap {
        uint[] data;
        // mapping from heap element to it's position in data array
        mapping (uint => uint) positions;
    }

    function push(MaxUintUniqueHeap storage heap, uint value) internal {
        if (heap.data.length == 0) {
            heap.data.push(0);
        }
        if (heap.positions[value] > 0) {
            // value is already in heap
            return;
        }
        heap.data.push(value);
        uint index = heap.data.length - 1;
        for (; index > 1 && value > heap.data[index / 2]; index /= 2) {
            heap.data[index] = heap.data[index / 2];
            heap.positions[heap.data[index]] = index;
        }
        heap.data[index] = value;
        heap.positions[value] = index;
    }

    function top(MaxUintUniqueHeap storage heap) internal view returns (uint) {
        require(heap.data.length > 1, "Heap is empty");
        return heap.data[1];
    }

    function size(MaxUintUniqueHeap storage heap) internal view returns (uint) {
        if (heap.data.length == 0) {
            return 0;
        }
        return heap.data.length - 1;
    }

    function _removeAt(MaxUintUniqueHeap storage heap, uint index) internal returns (uint) {
        uint res = heap.data[index];
        uint last = heap.data[heap.data.length - 1];

        if (last < res) {
            // move last to down
            while (index * 2 < heap.data.length) {
                uint nextIndex = index * 2;
                if (nextIndex + 1 < heap.data.length && heap.data[nextIndex] < heap.data[nextIndex + 1]) {
                    nextIndex++;
                }
                if (heap.data[nextIndex] > last) {
                    heap.data[index] = heap.data[nextIndex];
                    heap.positions[heap.data[index]] = index;
                    index = nextIndex;
                } else {
                    break;
                }
            }
        } else if (last > res) {
            // move last to top
            for (; index > 1 && last > heap.data[index / 2]; index /= 2) {
                heap.data[index] = heap.data[index / 2];
                heap.positions[heap.data[index]] = index;
            }
        }
        heap.data[index] = last;
        heap.positions[last] = index;

        heap.data.pop();
        delete heap.positions[res];

        return res;

    }

    function pop(MaxUintUniqueHeap storage heap) internal returns (uint) {
        require(heap.data.length > 1, "heap is empty");

        return _removeAt(heap, 1);
    }

    function remove(MaxUintUniqueHeap storage heap, uint value) internal returns (uint) {
        uint index = heap.positions[value];
        require(index > 0, "Task is not in heap");

        return _removeAt(heap, index);
    }

    function contains(MaxUintUniqueHeap storage heap, uint value) internal view returns (bool) {
        return heap.positions[value] > 0;
    }

    struct MinUintUniqueHeap {
        uint[] data;
        // mapping from heap element to it's position in data array
        mapping (uint => uint) positions;
    }

    function push(MinUintUniqueHeap storage heap, uint value) internal {
        if (heap.data.length == 0) {
            heap.data.push(0);
        }
        if (heap.positions[value] > 0) {
            // value is already in heap
            return;
        }
        heap.data.push(value);
        uint index = heap.data.length - 1;
        for (; index > 1 && value < heap.data[index / 2]; index /= 2) {
            heap.data[index] = heap.data[index / 2];
            heap.positions[heap.data[index]] = index;
        }
        heap.data[index] = value;
        heap.positions[value] = index;
    }

    function top(MinUintUniqueHeap storage heap) internal view returns (uint) {
        require(heap.data.length > 1, "Heap is empty");
        return heap.data[1];
    }

    function size(MinUintUniqueHeap storage heap) internal view returns (uint) {
        if (heap.data.length == 0) {
            return 0;
        }
        return heap.data.length - 1;
    }

    function _removeAt(MinUintUniqueHeap storage heap, uint index) internal returns (uint) {
        uint res = heap.data[index];
        uint last = heap.data[heap.data.length - 1];

        if (last > res) {
            // move last to down
            while (index * 2 < heap.data.length) {
                uint nextIndex = index * 2;
                if (nextIndex + 1 < heap.data.length && heap.data[nextIndex] > heap.data[nextIndex + 1]) {
                    nextIndex++;
                }
                if (heap.data[nextIndex] < last) {
                    heap.data[index] = heap.data[nextIndex];
                    heap.positions[heap.data[index]] = index;
                    index = nextIndex;
                } else {
                    break;
                }
            }
        } else if (last < res) {
            // move last to top
            for (; index > 1 && last < heap.data[index / 2]; index /= 2) {
                heap.data[index] = heap.data[index / 2];
                heap.positions[heap.data[index]] = index;
            }
        }
        heap.data[index] = last;
        heap.positions[last] = index;

        heap.data.pop();
        delete heap.positions[res];

        return res;

    }

    function pop(MinUintUniqueHeap storage heap) internal returns (uint) {
        require(heap.data.length > 1, "heap is empty");

        return _removeAt(heap, 1);
    }

    function remove(MinUintUniqueHeap storage heap, uint value) internal returns (uint) {
        uint index = heap.positions[value];
        require(index > 0, "Task is not in heap");

        return _removeAt(heap, index);
    }

    function contains(MinUintUniqueHeap storage heap, uint value) internal view returns (bool) {
        return heap.positions[value] > 0;
    }
}