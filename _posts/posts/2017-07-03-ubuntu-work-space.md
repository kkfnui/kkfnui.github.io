---
title: Workspace on Ubuntu
tags: Ubuntu
---


Rocksdb的文档看了一些，后面要开始写一些测试程序。
因此需要调试和测试的环境。

加上现在 MBP 的屏幕比较小，用来做看代码不是舒服。
所以，周末就将原来的台式机搬出来，重装了Ubuntu系统。

<!--more-->

## 安装系统

1. 下载 Ubuntu 17.0.1 TLS
2. 使用 ultraiso 制作U盘启动盘
3. 自动挂载机械磁盘
4. 代理配置
5. vscode 调式 rocksdb 代码
6. 使用 vscode 插件编辑 evernote

### 自动挂载机械磁盘

编辑 `/etc/fstab` 文件


在/etc目录下有个fstab文件，它里面列出了linux开机时自动挂载的文件系统的列表。

```
/dev/hda2 / ext3 defaults 1 1
/dev/hda1 /boot ext3 defaults 1 2
none /dev/pts devpts gid=5,mode=620 0 0
none /proc proc defaults 0 0
none /dev/shm tmpfs defaults 0 0
/dev/hda3 swap swap defaults 0 0
/dev/cdrom /mnt/cdrom iso9660 noauto,codepage=936,iocharset=gb2312 0 0
/dev/fd0 /mnt/floppy auto noauto,owner,kudzu 0 0
/dev/hdb1 /mnt/winc vfat defaults,codepage=936,iocharset=cp936 0 0
/dev/hda5 /mnt/wind vfat defaults,codepage=936,iocharset=cp936 0 0
```
 
fstab中存放了与分区有关的重要信息，其中每一行为一个分区记录，每一行又可分为六个部份

1. 第一项是您想要mount的储存装置的实体位置，如hdb或如上例的/dev/hda7。
2. 第二项就是您想要将其加入至哪个目录位置，如/home或如上例的/,这其实就是在安装时提示的挂入点。
3. 第三项就是所谓的local filesystem，其包含了以下格式：如ext、ext2、msdos、iso9660、nfs、swap等，或如上例的ext2，可以参见/prco/filesystems说明。
4. 第四项就是您mount时，所要设定的状态，如ro（只读）或如上例的defaults（包括了其它参数如rw、suid、exec、auto、nouser、async），可以参见「mount nfs」。
5. 第五项是提供DUMP功能，在系统DUMP时是否需要BACKUP的标志位，其内定值是0。
6. 第六项是设定此filesystem是否要在开机时做check的动作，除了root的filesystem其必要的check为1之外，其它皆可视需要设定，内定值是0。

## 代理配置

```shell
sudo apt-get intall shadowsocks
sslocl -d start -c /etc/shadowsocks/local.json
privoxy -c /etc/privoxy/config
```

**chromium**使用代理

chromium-browser  --proxy-server="localhost:8118"
 

添加开机启动—— /etc/init.d/proxy

```shell
#!/bin/sh

proxy_start(){
sslocal -d restart -c /etc/shadowsocks/chaofan.json
privoxy /etc/privoxy/config
}

proxy_stop(){
killall privoxy
sslocal -d stop -c /etc/shadowsocks/chaofan.json
}

case $1 in
start)
proxy_start
;;
stop)
proxy_stop
;;
*)

echo `Usage: proxy start|stop`
esac    
```

## vscode 调式 rocksdb 代码

起初我认为配置调试环境是很复杂的。
需要，配置编译链接的所有配置到vscode的配置中。

实际操作后，发现其实很简单。基本上使用的是默认配置：

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "(gdb) Launch",
            "type": "cppdbg",
            "request": "launch",
            "program": "${workspaceRoot}/db_basic_test",
            "args": [],
            "stopAtEntry": false,
            "cwd": "${workspaceRoot}",
            "environment": [],
            "externalConsole": true,
            "MIMode": "gdb",
            "setupCommands": [
                {
                    "description": "Enable pretty-printing for gdb",
                    "text": "-enable-pretty-printing",
                    "ignoreFailures": true
                }
            ]
        }
    ]
}
```

等待可以调试之后，我才想到不需要像一起做windows 或者 java 开发那样，依赖IDE做调试。
在做 android 无线下载库的时候，就是使用的 gdb + 可执行程序来调试的。
相比之前，vscode还做好了界面，使得调试起来和IDE的体验一样。

## jekyll 安装

```shell
sudo apt-get install ruby-dev
```


http://www.yekki.me/jekyll-blog-installation/