---
title: Jenkins 发送邮件模板
tags: Jenkins 邮件模板
category: 工作
---

<!--more-->


刚给项目搭建了**调度系统**，使用的是 `Jenkins`。原因：

- Jenkins 可以定时触发执行，也支持项目之间依赖关系
- 自己对 Jenkins 比较熟悉

今天项目有个定时的服务，需要将执行的最终日志发送给相关的人。但是服务的日志很多，最终需要的信息也就是日志的最后几行。

搜索了下发现可以使用 Jenkins 的内置变量可以支持:

```
${BUILD_LOG, maxLines=50, escapeHtml=false}
```
参考 Stackoverflow 的问题 [How can I take last 20 lines from the $BUILD_LOG variable?](http://stackoverflow.com/questions/16089096/how-can-i-take-last-20-lines-from-the-build-log-variable)


安上面的方法，可以将日志最后的50行通过邮件发送出来。但是，50行日志在邮件中显示在同一行了，不便于阅读。于是又在网上搜索了相关的问题，还是在 StackOverFlow 上找到了解决方法。使用 email-ext 插件的 Jelly 模板来将行与行分开。问题：
[Jenkins Email-ext plugin build log all on one line](http://stackoverflow.com/questions/22612440/jenkins-email-ext-plugin-build-log-all-on-one-line)


在实践上面一种解决方案的时候，发现 Jelly 模板会被 Jenkins 缓存到其他目录。修改模板文件后不能生效，重启都没有用。我就索性修改了模板名称。



