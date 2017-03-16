---
title: 使用 nginx 反向代理 codis-fe
tags: nginx 反向代理 codis 运维
---

经过一些调优,服务器 GC 耗时过长的问题得到缓解。
现在就需要着手解决问题的根源——数据库db。

第一步是搭建可横向扩展的 nosql 集群, 使用 codis + pika 实现。
coids 提供了管理界面程序 codis-fe。codis-fe 没有认证功能。
为了保证线上集群不能被随意访问和操作, 最少需要增加简单权限验证。


<!--more-->

## nginx reserve proxy

在 github 的一个 issue 看到关于访问控制的推荐解决方案 —— 使用 nginx 的 ldap 来解决。


LDAP 有点重。
想到了一个简单的方案:

- 限制 ip 在内网访问
- 并且使用 Basic Auth 验证。

**实现**:使用 nginx 反向代理 codis-fe, 并且对整个站点设置访问限制。

```
location / {
                proxy_pass http://localhost:18090;
                proxy_redirect off;
                proxy_set_header Host $host;

                auth_basic "Restricted Content";
                auth_basic_user_file /etc/nginx/.htpasswd;
             }

```



## set up password

nginx 的密码不是明文写在配置文件中的,需要为 nginx 生成密码文件。

这里使用 OpenSSL 生成密码文件。

```
 sh -c "echo -n 'username:' >> /etc/nginx/.htpasswd"
 sh -c "openssl passwd -apr1 >> /etc/nginx/.htpasswd"
```

第一行命令是设置用户名, 修改命令中的 username 来修改用户名。
第二行执行后, 会有交互提示输入密码。

```
service nginx reload
```

最后, 重新加载配置, 即可生效。

## ERR_CONTENT_LENGTH_MISMATCH


访问配置后的域名发现, 界面的展示是错误的。打开 Chrome 的控制台,发现在加载
css、js 等文件的时候出现了
`Failed to load resource: net::ERR_CONTENT_LENGTH_MISMATCH` 错误。

网上找了下原因, 是 nginx 对 proxy_temp 目录没有访问权限导致的。
一般的解决方案都是修改目录的权限。
了解到这个目录是放缓存文件的。
而我使用的场景是本机中转, 而且也不用考虑性能问题。
可以简单粗暴的设置不允许缓存文件就可以了。
这样就不会访问文件了,也更不会有权限问题。

```
proxy_max_temp_file_size 0;

```

