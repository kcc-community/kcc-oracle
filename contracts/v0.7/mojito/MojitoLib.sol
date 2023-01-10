// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

library FixedPoint {
  // range: [0, 2**112 - 1]
  // resolution: 1 / 2**112
  struct uq112x112 {
    uint224 _x;
  }

  // range: [0, 2**144 - 1]
  // resolution: 1 / 2**112
  struct uq144x112 {
    uint256 _x;
  }

  uint8 private constant RESOLUTION = 112;

  // encode a uint112 as a UQ112x112
  function encode(uint112 x) internal pure returns (uq112x112 memory) {
    return uq112x112(uint224(x) << RESOLUTION);
  }

  // encodes a uint144 as a UQ144x112
  function encode144(uint144 x) internal pure returns (uq144x112 memory) {
    return uq144x112(uint256(x) << RESOLUTION);
  }

  // divide a UQ112x112 by a uint112, returning a UQ112x112
  function div(uq112x112 memory self, uint112 x) internal pure returns (uq112x112 memory) {
    require(x != 0, "FixedPoint: DIV_BY_ZERO");
    return uq112x112(self._x / uint224(x));
  }

  // multiply a UQ112x112 by a uint, returning a UQ144x112
  // reverts on overflow
  function mul(uq112x112 memory self, uint256 y) internal pure returns (uq144x112 memory) {
    uint256 z;
    require(y == 0 || (z = uint256(self._x) * y) / y == uint256(self._x), "FixedPoint: MULTIPLICATION_OVERFLOW");
    return uq144x112(z);
  }

  // returns a UQ112x112 which represents the ratio of the numerator to the denominator
  // equivalent to encode(numerator).div(denominator)
  function fraction(uint112 numerator, uint112 denominator) internal pure returns (uq112x112 memory) {
    require(denominator > 0, "FixedPoint: DIV_BY_ZERO");
    return uq112x112((uint224(numerator) << RESOLUTION) / denominator);
  }

  // decode a UQ112x112 into a uint112 by truncating after the radix point
  function decode(uq112x112 memory self) internal pure returns (uint112) {
    return uint112(self._x >> RESOLUTION);
  }

  // decode a UQ144x112 into a uint144 by truncating after the radix point
  function decode144(uq144x112 memory self) internal pure returns (uint144) {
    return uint144(self._x >> RESOLUTION);
  }
}

library SafeMath {
  /**
   * @dev Returns the addition of two unsigned integers, with an overflow flag.
   *
   * _Available since v3.4._
   */
  function tryAdd(uint256 a, uint256 b) internal pure returns (bool, uint256) {
    uint256 c = a + b;
    if (c < a) return (false, 0);
    return (true, c);
  }

  /**
   * @dev Returns the substraction of two unsigned integers, with an overflow flag.
   *
   * _Available since v3.4._
   */
  function trySub(uint256 a, uint256 b) internal pure returns (bool, uint256) {
    if (b > a) return (false, 0);
    return (true, a - b);
  }

  /**
   * @dev Returns the multiplication of two unsigned integers, with an overflow flag.
   *
   * _Available since v3.4._
   */
  function tryMul(uint256 a, uint256 b) internal pure returns (bool, uint256) {
    // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
    // benefit is lost if 'b' is also tested.
    // See: https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
    if (a == 0) return (true, 0);
    uint256 c = a * b;
    if (c / a != b) return (false, 0);
    return (true, c);
  }

  /**
   * @dev Returns the division of two unsigned integers, with a division by zero flag.
   *
   * _Available since v3.4._
   */
  function tryDiv(uint256 a, uint256 b) internal pure returns (bool, uint256) {
    if (b == 0) return (false, 0);
    return (true, a / b);
  }

  /**
   * @dev Returns the remainder of dividing two unsigned integers, with a division by zero flag.
   *
   * _Available since v3.4._
   */
  function tryMod(uint256 a, uint256 b) internal pure returns (bool, uint256) {
    if (b == 0) return (false, 0);
    return (true, a % b);
  }

  /**
   * @dev Returns the addition of two unsigned integers, reverting on
   * overflow.
   *
   * Counterpart to Solidity's `+` operator.
   *
   * Requirements:
   *
   * - Addition cannot overflow.
   */
  function add(uint256 a, uint256 b) internal pure returns (uint256) {
    uint256 c = a + b;
    require(c >= a, "SafeMath: addition overflow");
    return c;
  }

  /**
   * @dev Returns the subtraction of two unsigned integers, reverting on
   * overflow (when the result is negative).
   *
   * Counterpart to Solidity's `-` operator.
   *
   * Requirements:
   *
   * - Subtraction cannot overflow.
   */
  function sub(uint256 a, uint256 b) internal pure returns (uint256) {
    require(b <= a, "SafeMath: subtraction overflow");
    return a - b;
  }

  /**
   * @dev Returns the multiplication of two unsigned integers, reverting on
   * overflow.
   *
   * Counterpart to Solidity's `*` operator.
   *
   * Requirements:
   *
   * - Multiplication cannot overflow.
   */
  function mul(uint256 a, uint256 b) internal pure returns (uint256) {
    if (a == 0) return 0;
    uint256 c = a * b;
    require(c / a == b, "SafeMath: multiplication overflow");
    return c;
  }

  /**
   * @dev Returns the integer division of two unsigned integers, reverting on
   * division by zero. The result is rounded towards zero.
   *
   * Counterpart to Solidity's `/` operator. Note: this function uses a
   * `revert` opcode (which leaves remaining gas untouched) while Solidity
   * uses an invalid opcode to revert (consuming all remaining gas).
   *
   * Requirements:
   *
   * - The divisor cannot be zero.
   */
  function div(uint256 a, uint256 b) internal pure returns (uint256) {
    require(b > 0, "SafeMath: division by zero");
    return a / b;
  }

  /**
   * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
   * reverting when dividing by zero.
   *
   * Counterpart to Solidity's `%` operator. This function uses a `revert`
   * opcode (which leaves remaining gas untouched) while Solidity uses an
   * invalid opcode to revert (consuming all remaining gas).
   *
   * Requirements:
   *
   * - The divisor cannot be zero.
   */
  function mod(uint256 a, uint256 b) internal pure returns (uint256) {
    require(b > 0, "SafeMath: modulo by zero");
    return a % b;
  }

  /**
   * @dev Returns the subtraction of two unsigned integers, reverting with custom message on
   * overflow (when the result is negative).
   *
   * CAUTION: This function is deprecated because it requires allocating memory for the error
   * message unnecessarily. For custom revert reasons use {trySub}.
   *
   * Counterpart to Solidity's `-` operator.
   *
   * Requirements:
   *
   * - Subtraction cannot overflow.
   */
  function sub(
    uint256 a,
    uint256 b,
    string memory errorMessage
  ) internal pure returns (uint256) {
    require(b <= a, errorMessage);
    return a - b;
  }

  /**
   * @dev Returns the integer division of two unsigned integers, reverting with custom message on
   * division by zero. The result is rounded towards zero.
   *
   * CAUTION: This function is deprecated because it requires allocating memory for the error
   * message unnecessarily. For custom revert reasons use {tryDiv}.
   *
   * Counterpart to Solidity's `/` operator. Note: this function uses a
   * `revert` opcode (which leaves remaining gas untouched) while Solidity
   * uses an invalid opcode to revert (consuming all remaining gas).
   *
   * Requirements:
   *
   * - The divisor cannot be zero.
   */
  function div(
    uint256 a,
    uint256 b,
    string memory errorMessage
  ) internal pure returns (uint256) {
    require(b > 0, errorMessage);
    return a / b;
  }

  /**
   * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
   * reverting with custom message when dividing by zero.
   *
   * CAUTION: This function is deprecated because it requires allocating memory for the error
   * message unnecessarily. For custom revert reasons use {tryMod}.
   *
   * Counterpart to Solidity's `%` operator. This function uses a `revert`
   * opcode (which leaves remaining gas untouched) while Solidity uses an
   * invalid opcode to revert (consuming all remaining gas).
   *
   * Requirements:
   *
   * - The divisor cannot be zero.
   */
  function mod(
    uint256 a,
    uint256 b,
    string memory errorMessage
  ) internal pure returns (uint256) {
    require(b > 0, errorMessage);
    return a % b;
  }
}

library MojitoLibrary {
  using SafeMath for uint256;

  // returns sorted token addresses, used to handle return values from pairs sorted in this order
  function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
    require(tokenA != tokenB, "MojitoLibrary: IDENTICAL_ADDRESSES");
    (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0), "MojitoLibrary: ZERO_ADDRESS");
  }
}

interface IMojitoPair {
  function getReserves()
    external
    view
    returns (
      uint112 reserve0,
      uint112 reserve1,
      uint32 blockTimestampLast
    );

  function price0CumulativeLast() external view returns (uint256);

  function price1CumulativeLast() external view returns (uint256);
}

library MojitoOracleLibrary {
  using FixedPoint for *;

  // helper function that returns the current block timestamp within the range of uint32, i.e. [0, 2**32 - 1]
  function currentBlockTimestamp() internal view returns (uint32) {
    return uint32(block.timestamp % 2**32);
  }

  // produces the cumulative price using counterfactuals to save gas and avoid a call to sync.
  function currentCumulativePrices(address pair)
    internal
    view
    returns (
      uint256 price0Cumulative,
      uint256 price1Cumulative,
      uint32 blockTimestamp
    )
  {
    blockTimestamp = currentBlockTimestamp();
    price0Cumulative = IMojitoPair(pair).price0CumulativeLast();
    price1Cumulative = IMojitoPair(pair).price1CumulativeLast();

    // if time has elapsed since the last update on the pair, mock the accumulated price values
    (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IMojitoPair(pair).getReserves();
    if (blockTimestampLast != blockTimestamp) {
      // subtraction overflow is desired
      uint32 timeElapsed = blockTimestamp - blockTimestampLast;
      // addition overflow is desired
      // counterfactual
      price0Cumulative += uint256(FixedPoint.fraction(reserve1, reserve0)._x) * timeElapsed;
      // counterfactual
      price1Cumulative += uint256(FixedPoint.fraction(reserve0, reserve1)._x) * timeElapsed;
    }
  }
}

library Strings {
  bytes16 private constant _HEX_SYMBOLS = "0123456789abcdef";

  /**
   * @dev Converts a `uint256` to its ASCII `string` decimal representation.
   */
  function toString(uint256 value) internal pure returns (string memory) {
    // Inspired by OraclizeAPI's implementation - MIT licence
    // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

    if (value == 0) {
      return "0";
    }
    uint256 temp = value;
    uint256 digits;
    while (temp != 0) {
      digits++;
      temp /= 10;
    }
    bytes memory buffer = new bytes(digits);
    while (value != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
      value /= 10;
    }
    return string(buffer);
  }

  /**
   * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation.
   */
  function toHexString(uint256 value) internal pure returns (string memory) {
    if (value == 0) {
      return "0x00";
    }
    uint256 temp = value;
    uint256 length = 0;
    while (temp != 0) {
      length++;
      temp >>= 8;
    }
    return toHexString(value, length);
  }

  /**
   * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation with fixed length.
   */
  function toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
    bytes memory buffer = new bytes(2 * length + 2);
    buffer[0] = "0";
    buffer[1] = "x";
    for (uint256 i = 2 * length + 1; i > 1; --i) {
      buffer[i] = _HEX_SYMBOLS[value & 0xf];
      value >>= 4;
    }
    require(value == 0, "Strings: hex length insufficient");
    return string(buffer);
  }
}

interface IMojitoFactory {
  function getPair(address tokenA, address tokenB) external view returns (address pair);
}
