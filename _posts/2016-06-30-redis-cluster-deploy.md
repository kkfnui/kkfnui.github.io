---
title: Redis 集群部署实战
tags: Redis 集群 部署
category: 工作
---




### Redis 集群规划

计划部署最简单的Redis集群，使用3台物理机器。
配置：

- 每个节点配置10G内存，  maxmemory 10GB
- 对所有key使用lru淘汰策略，maxmemory-policy allkeys-lru
- 数据持久化

<!--more-->

### Redis编译安装

**编译环境**

```
yum -y install gcc
yum -y install tcl
yum -y install zlib ruby rubygems
gem sources --add https://ruby.taobao.org/ --remove https://rubygems.org/
gem install redis
```

**编译**

```
wget http://download.redis.io/releases/redis-3.2.1.tar.gz
tar -xvzf redis-3.2.1.tar.gz
cd redis-3.2.1
make
taskset -c 0 sudo make test  #https://github.com/antirez/redis/issues/2715

```


### 安装

默认执行 `make install` 可以完成安装，也可以使用 `make PREFIX=/some/other/directory install` 更换安装目的路径。

默认的安装方式，仅仅会安装二进制文件到系统中，不会配置自启动和服务。在生产环境

**安装成服务**

```
make install
cd utils
./install_server.h


#端口：30000、 30001
#配置文件路径：/etc/redis/
#日志文件路径：/usr/local/logs/redis
#数据文件路径：/usr/local/data
```

详细配置：

```
Selected config:
Port           : 30001
Config file    : /etc/redis/30001.conf
Log file       : /usr/local/logs/redis/redis_30001.log
Data dir       : /usr/local/data/redis/30001
Executable     : /usr/local/bin/redis-server
Cli Executable : /usr/local/bin/redis-cli
```


### 防火墙配置

**需求**
开放 `tw06540`,`tw06541`,`tw06542`三台机器的集群，每台机器的防火墙需要开发4个端口：

1. 30000 40000
2. 30001 40001

其中`30000``30001`是向客户端开放的，`4000`、`40001` 可以仅在集群之间开放。

### 修改redis.conf

bind 字段，绑定到指定的网卡和 127.0.0.1 上。

> **误区**
> 如果bind多张网卡，注意第一个绑定的ip地址要和`redis-trib`创建集群时候使用的ip地址一致。不然会创建集群失败。




## Redis集群安装

**快速清理错误集群实例信息**

```
service redis_30000 stop &&  service redis_30001 stop

rm -rvf /usr/local/data/redis/30000/* && rm -rvf /usr/local/data/redis/30001/*

service redis_30000 start &&  service redis_30001 start
```


<!--```
./redis-trib.rb create --replicas 1 10.33.7.40:30000 10.33.7.40:30001 \
10.33.7.41:30000 10.33.7.41:30001 10.33.7.42:30000 10.33.7.42:30001
```-->

## Redis集群测试

```
127.0.0.1:30000> set lvfei test EX 10
(error) MOVED 6016 10.33.7.41:30000
```

以上说明 key `lvfei` 应该保存到 `10.33.7.41:30000`节点上。


## 扩展资料

- [Redis 集群规范](http://redisdoc.com/topic/cluster-spec.html)
- [Redis 3.0.5 集群的命令、使用、维护](https://www.zybuluo.com/phper/note/205009#cluster-meet)
- [jedis 客户端](https://github.com/xetorthio/jedis)



