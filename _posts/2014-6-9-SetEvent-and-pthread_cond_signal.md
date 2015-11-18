---
layout: post
title:  pthread_cond_signal和SetEvent的差异
date:   2014-6-9 16:00
categories: 系统
---
接着上个礼拜的开发。同事调用我的库之后，发现会出现调用接口卡住的问题。

其根本原因是对pthread_cond_signal的使用存在误解。以为和windows下的SetEvent一样使用。错误的代码:

```cpp
//接口线程
void SendCommand(Command *pCommand)
{
    {
        Lock(commandList);
        commandList.push_back(pCommand);
    }

    {
        Lock(pCommand->lock);
        pthread_cond_signal(pCommand->cond, pCommand->lock);
    }
}


// 主线程
void HandleCommand(Command *pCommand)
{
    pCommand->Execute();
    {
        Lock(pCommand->lock);
        pthread_cond_signal(pCommand->cond);
    }
}
```

因为命令列表的锁和命令的锁是独立的。这样会出现主线程先获取到命令并执行`pthread_cond_signal`之后，才执行接口线程的代码。最终，`pCommand->cond`就不能激活了。

`pthread_cond_signal`和windows下的`SetEvent`有差异，在实现的时候就凭这对`SetEvent`的理解使用了`pthread_cond_signal`。
具体差异分析，参考[小心pthread_cond_signal和SetEvent之间的差异](http://blog.csdn.net/absurd/article/details/1402433)


> 从博主的文章那里看到了两个资料：
> 
> 1. [reactos](http://reactos.com/zh-hans)。到目前为止官网没有提供最新版本对应的源代码（*找了好久才反应过来*）
> 2. glibc的源代码



