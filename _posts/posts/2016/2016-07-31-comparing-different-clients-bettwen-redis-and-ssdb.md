---
title: SSDB 和 Redis 不同客户端性能对比及协议解析分析
tags:  SSDB Redis jedis lettue 性能测试
---

上周五测试了 [hydrogen-ssdb](https://github.com/yiding-he/hydrogen-ssdb) 客户端。
发现在解析较大的响应数据的时，解析效率较低。
主要原因是其在接收网络数据时，每次仅仅读取一个字节。
所以会有**大量的系统调用**。

是否会有大量的系统调用呢？

会的。代码实现在 SockInputStream.java 中。
调用 `read()` 方法，每次就调用系统方法`socketRead0`，
并读取一个字节到缓冲区中。而调用 `read(byte[] bytes)` 则每次读取较多的数据。

<!--more-->

## 解析速度对比


| 服务 | 操作 | 耗时 |
| --- | --- | --- |
| redis/lettue | keys 5000, mget 500  value 2k| 212ms |
| redis/jedis | keys 5000, mget 500  value 2k| 300ms |
| ssdb/hybird client | scan 500, value 2k  | 2600ms |



## 协议解析对比

性能：

jedis > lettue >> hybird

why?

### 数据长度解析

其中 hybird 中解析协议中数据长度是通过构造String对象，然后使用 Integer.parse 方法去解析。有多次内存拷贝和对象创建销毁。

单独测试两种不同解析方法的代码：https://gist.github.com/kkfnui/8edfab884418d9265ddb921de335dfbb

**jedis**

```
 long value = 0;
    while (true) {
      ensureFill();

      final int b = buf[count++];
      if (b == '\r') {
        ensureFill();

        if (buf[count++] != '\n') {
          throw new JedisConnectionException("Unexpected character!");
        }

        break;
      } else {
        value = value * 10 + b - '0';
      }
    }
```

**lettue**

```
  private long readLong(ByteBuf buffer, int start, int end) {
        long value = 0;

        boolean negative = buffer.getByte(start) == '-';
        int offset = negative ? start + 1 : start;
        while (offset < end - 1) {
            int digit = buffer.getByte(offset++) - '0';
            value = value * 10 - digit;
        }
        if (!negative) {
            value = -value;
        }
        buffer.readerIndex(end + 1);

        return value;
    }
```

**hybird**

```java
dataLength = Integer.parseInt(numSb.toString());
bos.reset();
numSb.setLength(0);
```


## jedis vs lettue

测试case：

1. 使用 `keys` 返回 5000 个 key 的列表
2. 使用 `mget` 获取这 5000 key 对应的 value


| 客户端 | 耗时 |
| --- | --- |
| jedis | 481ms |
| lettue | 1s |

以上测试结果都是个位数级别的测试case，但是差距显著。


