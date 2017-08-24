---
title: 保存 shell 中正在输入的命令
tags: shell linux
category: 学习创作
---



在使用 shell 时,经常会碰到这样的情况。
当前正在输入命令A,却需要先执行命令B。

执行完命令 B 后,一般我就要重新敲命令 A 了。
如果能够自动的保存命令 A, 可以快速恢复命令 A,那就是最好了。
<!--more-->



## kill-ring

1. 输入命令 `A`
2. 按快捷键 CTRL + U
3. 输入新命令 `B`
3. 按快捷键 CTRL + Y, *即可恢复命令 A*


以上操作使用到了 kill-ring 功能。
每次按 CTRL + U 的时候, 就会将当前光标前的命令保存到 ring-buffer 中。
并且按 CTRL + Y 的时候, 会将 ring-buffer 中的数据粘贴到当前命令行中。


## comment

使用注释的方法。核心就是将当前的命令变成注释,并且执行。
这样命令会被记住,并且不会执行。这个方法很妙!

```sh
# Command A
echo 'hello'
```

如上, Command A 就会被保存在历史记录中了。



