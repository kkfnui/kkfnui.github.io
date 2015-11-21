---
layout: post
title: "编辑距离"
author: "kkfnui"
date: 2015-9-3 11:19:15 +0800
tags:
- Algorithm
---



现在在做游戏推荐项目。希望通过推荐增加转化率。由于时间紧迫就决定使用 `编辑距离` 来计算两个游戏简介的关联性。

> 编辑距离（Edit Distance），又称Levenshtein距离，是指两个字串之间，由一个转成另一个所需的最少编辑操作次数。许可的编辑操作包括将一个字符替换成另一个字符，插入一个字符，删除一个字符。一般来说，编辑距离越小，两个串的相似度越大。   
例如将kitten一字转成sitting：
   
>- sitten （k→s）
- sittin （e→i）
- sitting （→g）  

		  
> 俄罗斯科学家Vladimir Levenshtein在1965年提出这个概念。

###学习

除了上面的概念，在网上搜索了之后看了几篇相关的博文：

1. [字符串相似度算法（编辑距离算法 Levenshtein Distance）](http://www.cnblogs.com/ivanyb/archive/2011/11/25/2263356.html)
2. [动态规划(5)-最小编辑距离(Edit Distance)](http://www.acmerblog.com/dp5-edit-distance-4883.html)

第一篇的介绍相对来说不是连贯的，给出的程序算法让我摸不着头脑。

第二篇从划分子问题的角度出发，先给出了递归的解法。然后在优化成最终的算法。
虽然是殊途同归，但是第二篇显然质量更高。

###其他资源

1. [Dynamic Programming | Set 5 (Edit Distance)](http://www.geeksforgeeks.org/dynamic-programming-set-5-edit-distance/)
2. [Minimum&Edit& Distance](https://web.stanford.edu/class/cs124/lec/med.pdf)




