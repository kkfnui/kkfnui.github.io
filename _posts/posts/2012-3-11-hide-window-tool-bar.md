---
title: 捣腾隐藏任务栏的小工具
tags: Windows 任务栏 工具 C++ 快捷键
category: 学习创作
---

工作的时候，会开很多程序：记事本、浏览器、Explorer、IDE、QQ、RTX等。
在写程序的时候看到这样的任务栏，觉得非常乱呀。就想将任务栏隐藏起来,
试过将任务栏设置成自动隐藏的。
但是鼠标一不小心划到任务栏上,
它就弹出来了，就挡住了正在编辑的代码区域。

<!--more-->

于是想到通过快捷键的控制任务栏的显示与隐藏。自己写了个小工具实现了这个功能。
原理很简单：使用`FindWindow`找到任务栏的窗口，将其设置成隐藏的便可以了。
可是整个实现的过程却走了些弯路：

- 一开始便是错误的使用了`FindWindow`这个方法。我是通过类名来查找窗口的，所以不用传入Title参数。
于是我便传进了一个空字符串，而正确的做法是传入NULL。看来最近在搞脚本开发对于C++产生了影响了，是两种语言的编程思想有所差异的原因吧。

- 再者是自己对于Windows的了解太少了。任务栏隐藏后，程序最大化时也无法占据该区域。
我一直想通过设置Windows默认窗体最大化的高度来解决这个问题。可是我没有认识到，这个值 Windows 肯定是不可能直接暴露出来的。
后面 @王俊 同学提醒到，这和全屏功能很像，并找出了问题根本的原因——没有捕获其他程序的 `WM_GETMINMAXINFO`的消息。

- 最终，想到为什么不先将任务栏设置成自动隐藏，如果出现了开始所说的情况再将任务栏设置成不可见呢。

为了方便操作，在实际的使用中我用[http://mayhem.codeplex.com/](http://mayhem.codeplex.com/ "Mayhem")这个工具来绑定了快捷键。
昨天刚在新闻里面看到Mayhem，使用它主要原因是为了尝鲜。

工具源码的地址：[https://github.com/kkfnui/Experiments/tree/master/My%20Tools/Control_Task_Bar](https://github.com/kkfnui/Experiments/tree/master/My%20Tools/Control_Task_Bar)

现在这样设置之后，看任务确实不方便了。有时想切换任务不方便，尤其是用Window默认的Alt+Tab操作。于是就在网上找了个工具：[http://www.ntwind.com/software/vistaswitcher.html](http://www.ntwind.com/software/vistaswitcher.html "VistaSwitcher ")


