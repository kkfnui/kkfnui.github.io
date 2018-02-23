---
title: 在华硕路由部署 Shadowsocks 服务
tags: asus OpenWrt Shadowsocks
---

上网翻墙对我来说一直是一个刚需。
之前都是在电脑和手机上安装上相应的软件。
这是这样的操作方式低效且扩展性差：

1. 更换不同的手机，需要重新安装
2. 苹果手机安装软件就比较麻烦了

很早就想再路由器上安装上 Shadowsocks 服务，
这样不需要终端设备做任何事情了。
家庭中的其他成员使用也没有任何问题。

<!--more-->

## 尝试

原本使用小米路由 3。
论坛上很多人都说可以刷机。
实际操作过后，发现实在比较费劲——主要是小米禁止了普通的刷机途径导致的。

> 当前openwrt官方已经支持小米路由mini了，估计小米也是发现众多mini的用户都刷成官方openwrt了，不受雷军控制了，窃取不到用户数据了，推送不了广告了。所以发布了小米路由3，使用了少见的nand flash，就是不让你刷。  
> 一个nand flash的编程器要700多大洋，很多开发者望而止步了。breed的作者H大都说不再开发小米路由3的版本的了。没有breed，也就不敢随便乱刷固件了。其实openwrt官方是由nand flash驱动的，可以支持适配mt7620a + nand flash这样的硬件组合，适配起来应该不是很麻烦吧。就是没有breed，不敢随便搞，有哪位尝试了小米路由3刷mini版或者mt7620a通用版的breed，能成功使用的可以告诉我啊，如果可以的化，我就可以去研究openwrt 适配小米路由3了。   
> *原文:* [虎哥openwrt奇幻漂流记](http://bbs.xiaomi.cn/t-12922106)

由于该文章发布已经过了一段时间了，所以文章中提到的部分资源也无法下载。
自己也嫌麻烦，就放弃了使用 小米路由3 的刷机想法了。

于是在寻找其他的替代方案，看论坛中提到了华硕刷梅林固件的方式。
这时候也想起了公司里面使用的就是这个方案。
另外想着，小米路由的信号也太差了，所以就决定换个路由器—— [ASUS RT-AC1900](https://item.jd.com/4164451.html)

## ASUS 刷梅林固件

梅林固件是官网认可的一个第三方固件。
所以在 ASUS 的路由器刷梅林固件是很简单的。
可以通过 web 管理界面直接上传固件刷机。

网上搜索资源的时候，看到了 KoolShare 的介绍。
KoolShare 是在梅林固件上增加了插件中心。
使用起来会更方便，所以现在我使用的是 KoolShare
Koolshare刷机相关资源：

1. [下载](http://firmware.koolshare.cn/)
2. [论坛](http://koolshare.cn/thread-126243-1-1.html)



## 总结

这是第一次给路由器刷机。
刚开始看到了很多名词都很陌生，其实非常影响对教程的理解。
这里就捋一遍相关的概念及关系吧。

![关系](/assets/img/blog/wrt/wrts-relation.svg?@1x)


### 关系

主流的 WRT 固件有： OpenWrt、DD-WRT、Tomato。

DD-WRT 开始是基于 Linksys WRT54G 开发的。由于开源授权的问题，Linksys WRT54G开源了。
开源后有一个分支衍化成了 OpenWrt。 DD-WRT 在 06 年之后，又再基于 OpenWrt 做了重构。
这个关系有点乱的。

Tomato 是在 HyperWRT 基础上开发的。 Asus WRT 是基于 Tomato 开发的。
Merlin Asus WRT 则是基于Asus 的闭源驱动开发的一个开源固件。
KoolShare 则在 Merlin 上做了修改，增加了插件中心。
KoolShare 是闭源的，官方的解释是使用的漏洞实现的插件中心功能，所以不能开源。


## 参考

1. [Tomato](https://www.wikiwand.com/en/Tomato_(firmware))
2. [DD-WRT](https://www.wikiwand.com/zh/DD-WRT)
3. [OpenWrt](https://www.wikiwand.com/zh/OpenWrt)
4. https://www.zhihu.com/question/49787104/answer/310444157
5. https://www.zhihu.com/question/40121353
6. https://www.zhihu.com/question/37626675