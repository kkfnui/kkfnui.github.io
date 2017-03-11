---
title: 使用 prometheus + grafana 做性能测试图形化输出
tags: 性能测试 prometheus grafana pika
---

压测在性能优化中是必不可少的一步。
如何收集性能数据,将性能数据有机的汇总出来呢?
使用图形化展示是一个很不错的方式。

这周对 [pika](https://github.com/Qihoo360/pika)集群做性能测试。
性能测试结果使用了 prometheus + grafana 做图形化输出。

<!--more-->

## prometheus

[prometheus](https://prometheus.io/docs/introduction/overview/)
是一个开源系统监控和报警工具箱。现在有很多公司都在使用它。

功能列表:

- 多维度的[数据模型](https://prometheus.io/docs/concepts/data_model/)
- 灵活的查询语句,能够更好的应对多维度数据
- 时间序列的数据的收集使用的是 拉模型, 使用 HTTP 定时获取数据
- 也可以通过 GateWay 推送数据
- 监控对象可以自动发现,也可以使用配置文件配置
- 仪表盘能够支持多种类型的图形展示

![Architecture](/assets/img/prometheus/architecture.svg)



## grafana

[grafana](http://docs.grafana.org/)也是开源的,
是一个指标分析和图形化展示的工具。
一般用来分析基础组件和应用的时序数据,如 QPS、耗时。
也可以用在工业的传感器、智能家庭、天气和过程控制中。

图形化做的真心好:

![dashborad](/assets/img/grafana/dashboard_ex1.png?@1.5x)

其他介绍:
1. [功能列表](http://grafana.org/features/)
2. [更多的截图展示](http://docs.grafana.org/tutorials/screencasts/)

## prometheus client

prometheus + grafana 的方案中, prometheus 负责收集各项指标数据,
 grafana 则是负责将指标数据图形化输出。

prometheus 收集的数据指标有以下四种类型:

1. Counter, 用来做指标累加计数, 可以统计接口调用量、qps
2. Gauge, 单个数值,可以用来展示温度、内存使用这样的指标数据
3. Histogram, 相对复杂些,可以计数、求和,可以计算占比。
4. Summary

在这次压测的时候使用到了 Counter 和 Histogram, 分别用来统计写入数据的速度
和 get、set 操作的耗时占比。

为了方便收集数据, prometheus 提供了各种语言的client。
其接口设计通用, 但在简单的使用场景下,需要封装下会更容易被使用。
比如,原生计数的接口调用:

```java
Counter counter = Counter.build().name(name).help(name).create();
```

由于 prometheus 中不能存在相同的指标名称。
后面想要计数,必须调用这个已经实例化的对象了。
使用起来有点麻烦, 我自己对它做了[封装](https://gist.github.com/kkfnui/4905d879005d76acfd36b4cc6758bcbd)

## push gateway

压测工具的生命周期是短暂的, 因此不能使用 pull 模式。
需要使用 push 模式 —— 客户端将指标数据 push 到 gateway,
 prometheus server 再从 gateway 上 pull 数据。

**注意:** 指标数据需要 client 定时的上报上去,间隔越短越好。
如果是在程序要退出的时候一次性上报,那么所有数据的生成时间就都是一样的了。

压测工具使用线程池调用 get、set 操作, 主线程负责等待以及定时上报数据。

```java
   @Override
    public void run(String... strings) throws Exception {

        int count = 5;
        CountDownLatch countDownLatch = new CountDownLatch(count);

        ExecutorService exec = Executors.newFixedThreadPool(count);
        for (int i = 0; i < count; i++) {
            exec.submit(new WriteWork(pika, countDownLatch));
        }
        synchronized (exec) {
            while (true) {
                exec.wait(1000);
                System.out.print("Writed count: " + WriteWork.getCount() +
                        " write count: " + countDownLatch.getCount() +
                        "\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b" +
                        "\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b" +
                        "\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b");
                PrometheusMetric.getInstance().push("xxxxxxxx:9091", "pika-test");

                if (countDownLatch.getCount() == 0) {
                    break;
                }
            }
        }

        List<String> keys = WriteWork.getKeys();
        System.out.println("total keys: " + keys.size());
        CountDownLatch getCountDown = new CountDownLatch(count);

        ExecutorService getExec = Executors.newFixedThreadPool(count);

        for (int i = 0; i < count; i++) {
            getExec.submit(new ReadWork(pika, keys, getCountDown));
        }
        synchronized (getExec) {
            while (true) {
                getExec.wait(1000);
                System.out.print("read count:" + ReadWork.getCount() + ". thread count: " + getCountDown.getCount() +
                        "\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b" +
                        "\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b" +
                        "\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b");
                PrometheusMetric.getInstance().push("xxxxxxxx:9091", "pika-test");

                if (getCountDown.getCount() == 0) {
                    break;
                }
            }
        }

        PrometheusMetric.getInstance().push("xxxxxxxx:9091", "pika-test");
    }
```


## 指标图形化展示


在 `ReadWork` 和 `WriteWork` 中收集了下列指标数据:

1. writeBytes, Counter 类型,统计写入 pika 的字节数以及写入速度
2. jedisWrite, Histogram 类型,统计 set 操作的 qps,以及99% 99.9%操作耗时
3. jedisRead,  Histogram 类型,统计 get 操作的 qps,以及99% 99.9%操作耗时

最后在 grafana 中可以输入响应的表达式, 就能够得到图形化展示了。

- 写入数据的速度:

  rate(writeBytes[1m])   # 一分钟内平均的写入速度

- Set 操作的 QPS

  rate(jedisWrite_count[1m]) # 一分钟内平均的 QPS

- Set 操作99%耗时

  histogram_quantile(0.99, rate(jedisWrite_bucket[1m]))

最后来一张截图,看看效果:

![测试截图](/assets/img/grafana/perf.png)