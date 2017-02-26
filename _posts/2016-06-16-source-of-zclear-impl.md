---
title: zclear 命令实现源码分析(一)
tags: SSDB 源码阅读 leveldb zclear
category: 工作
---


节[上一篇](http://blog.makerome.com/2016/06/15/zclear-cmd-lead-ssdb-to-slow.html),
发现 zclear 可能会导致 zrrange 操作耗时过高的问题,今天从代码上验证下。
涉及到 `leveldb` 的没有升入了解，本文只分析了 SSDB 层面的一些逻辑。

- **结论：** SSDB `zclear`内部实现是通过遍历列表，逐个删除实现的。
- **猜想：** SSDB 将所有`Sorted set`存储在一个全局列表中（*不太可能吧*），在删除大批量的数据后有可能导致数据出现空洞，从而影响其他列表操作，降低列表操作性能。

<!--more-->

## zclear 的实现

`zclear` 是一个复合函数，内部使用 `zscan` 扫描列表元素，然后调用`zdel`一个一个去删除。

```cpp
int proc_zclear(NetworkServer *net, Link *link, const Request &req, Response *resp){
	SSDBServer *serv = (SSDBServer *)net->data;
	CHECK_NUM_PARAMS(2);

	const Bytes &name = req[1];
	int64_t count = 0;
	std::string key_start, score_start;
	while(1){
		ZIterator *it = serv->ssdb->zscan(name, key_start, score_start, "", 1000);
		int num = 0;
		while(it->next()){
			key_start = it->key;
			score_start = it->score;
			int ret = serv->ssdb->zdel(name, key_start);
			if(ret == -1){
				resp->push_back("error");
				delete it;
				return 0;
			}
			num ++;
		};
		delete it;

		if(num == 0){
			break;
		}
		count += num;
	}
	resp->reply_int(0, count);

	return 0;
}
```

## zdel 的实现

主要还是由 `zdel_one` 实现

```cpp
int SSDBImpl::zdel(const Bytes &name, const Bytes &key, char log_type){
	Transaction trans(binlogs);

	int ret = zdel_one(this, name, key, log_type);
	if(ret >= 0){
		if(ret > 0){
			if(incr_zsize(this, name, -ret) == -1){
				return -1;
			}
		}
		leveldb::Status s = binlogs->commit();
		if(!s.ok()){
			log_error("zdel error: %s", s.ToString().c_str());
			return -1;
		}
	}
	return ret;
}
```

## zdel_one 的实现

先取元素，判断元素是否存在，如果存在则先后依次删除：

1. score
2. 删除key

这里有几个疑惑：

1. score 和 key 是单独存储的，具体的数据结构是怎样的？
2. BinlogQueue *binlogs; 这个是ssdb 自己实现的，还是 levedb 的机制

```cpp
static int zdel_one(SSDBImpl *ssdb, const Bytes &name, const Bytes &key, char log_type){
	if(name.size() > SSDB_KEY_LEN_MAX ){
		log_error("name too long!");
		return -1;
	}
	if(key.size() > SSDB_KEY_LEN_MAX){
		log_error("key too long!");
		return -1;
	}
	std::string old_score;
	int found = ssdb->zget(name, key, &old_score);
	if(found != 1){
		return 0;
	}

	std::string k0, k1;
	// delete zscore key
	k1 = encode_zscore_key(name, key, old_score);
	ssdb->binlogs->Delete(k1);

	// delete zset
	k0 = encode_zset_key(name, key);
	ssdb->binlogs->Delete(k0);
	ssdb->binlogs->add_log(log_type, BinlogCommand::ZDEL, k0);

	return 1;
}
```





