// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

library Hamming {
    function hammingUint(uint a, uint b) internal pure returns (uint) {
        uint c = uint(a ^ b);
        uint res = 0;
        while (c > 0) {
            res += c & 1;
            c = c >> 1;
        }
        return uint(res);
    }

    function hamming(bytes memory a, bytes memory b, uint start, uint end) internal pure returns (uint) {
        require(a.length == b.length, "length is not same");
        uint distance = 0;
        for (uint i = start; i < end; i += 32) {
            uint length = 32;
            if (i + length > end) {
                length = end - i;
            }
            uint _a = uint(bytes32(slice(a, i, length)));
            uint _b = uint(bytes32(slice(b, i, length)));
            distance += hammingUint(_a, _b);
        }
        return distance;
    }

    function compareHamming(
        bytes memory a,
        bytes memory b,
        uint threshold
    ) internal pure returns (bool) {
        if (a.length == b.length && a.length % 8 == 0) {
            for (uint start = 0; start < a.length; start += 8) {
                uint distance = hamming(a, b, start, start + 8);
                if (distance >= threshold) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    ) internal pure returns (bytes memory) {
        require(_length + 31 >= _length, "slice_overflow");
        require(_bytes.length >= _start + _length, "slice_outOfBounds");

        bytes memory tempBytes;

        // Check length is 0. `iszero` return 1 for `true` and 0 for `false`.
        assembly {
            switch iszero(_length)
            case 0 {
                // Get a location of some free memory and store it in tempBytes as
                // Solidity does for memory variables.
                tempBytes := mload(0x40)

                // Calculate length mod 32 to handle slices that are not a multiple of 32 in size.
                let lengthmod := and(_length, 31)

                // tempBytes will have the following format in memory: <length><data>
                // When copying data we will offset the start forward to avoid allocating additional memory
                // Therefore part of the length area will be written, but this will be overwritten later anyways.
                // In case no offset is require, the start is set to the data region (0x20 from the tempBytes)
                // mc will be used to keep track where to copy the data to.
                let mc := add(
                    add(tempBytes, lengthmod),
                    mul(0x20, iszero(lengthmod))
                )
                let end := add(mc, _length)

                for {
                    // Same logic as for mc is applied and additionally the start offset specified for the method is added
                    let cc := add(
                        add(
                            add(_bytes, lengthmod),
                            mul(0x20, iszero(lengthmod))
                        ),
                        _start
                    )
                } lt(mc, end) {
                    // increase `mc` and `cc` to read the next word from memory
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    // Copy the data from source (cc location) to the slice data (mc location)
                    mstore(mc, mload(cc))
                }

                // Store the length of the slice. This will overwrite any partial data that
                // was copied when having slices that are not a multiple of 32.
                mstore(tempBytes, _length)

                // update free-memory pointer
                // allocating the array padded to 32 bytes like the compiler does now
                // To set the used memory as a multiple of 32, add 31 to the actual memory usage (mc)
                // and remove the modulo 32 (the `and` with `not(31)`)
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            // if we want a zero-length slice let's just return a zero-length array
            default {
                tempBytes := mload(0x40)
                // zero out the 32 bytes slice we are about to return
                // we need to do it because Solidity does not garbage collect
                mstore(tempBytes, 0)

                // update free-memory pointer
                // tempBytes uses 32 bytes in memory (even when empty) for the length.
                mstore(0x40, add(tempBytes, 0x20))
            }
        }

        return tempBytes;
    }
}
