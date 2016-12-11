---
layout: post
title: "How to automate CentOS installation with kickstart file"
date: 2016-01-21 00:00:00 +0300
intro: "Hey! Today I want to tell about automation of CentOS installation process. In previous articles I’ve described some automation tools, first of all, that is Ansible. Really, I use that tool almost every day, because there are many tasks with linux administration at my work, however I work on web developer position. But I want to automate everything, because these things take much time constantly and not allow to concentrace on process of software development. Fortunatelly, I like tasks from DevOps world and today I’ve resolved one more problem."
categories: devops
tags: linux centos
---

As I said before I use Ansible to automate provisioning of my virtual servers. But again and again, before provisioning, I need to install base system before. Everytime I need to specify some settings, such as timezone, disk partitions, root password, etc. That boring process takes from me about 10-15 minutes for each server instance. And recently I found solution that called kickstart file.

If you have installed CentOS/RedHat/Fedora distributions before, it should be the `/root/anaconda-ks.cfg` file on your filesystem. That file was generated automatically and contain settings that you provided during installation process. So, you can use that file for another installations. But, as a rule, it’s needed some modifications. I will show you my kickstart file:

```
#version=DEVEL
install
url --url=http://mirror.yandex.ru/centos/6.7/os/x86_64
lang en_US.UTF-8
keyboard us
network --onboot yes --device eth0 --bootproto dhcp --ipv6 auto
rootpw toor
firewall --service=ssh
authconfig --enableshadow --passalgo=sha512
selinux --enforcing
timezone --utc Europe/Moscow
bootloader --location=mbr --driveorder=sda --append="crashkernel=auto rhgb quiet"

clearpart --all --drives=sda

part /boot --fstype=ext4 --size=500
part pv.01 --grow --size=1

volgroup vg_main --pesize=4096 pv.01
logvol swap --name=lv_swap --vgname=vg_main --size=2048
logvol / --fstype=ext4 --name=lv_root --vgname=vg_main --size=20480
logvol /tmp --fstype=ext4 --name=lv_tmp --vgname=vg_main --size=2048
logvol /var/log --fstype=ext4 --name=lv_log --vgname=vg_main --size=2048
logvol /var/www --fstype=ext4 --name=lv_www --vgname=vg_main --grow --size=10240

repo --name="CentOS" --baseurl=http://mirror.yandex.ru/centos/6.7/os/x86_64 --cost=100

user --name=deploy —password=toor

reboot

%packages
@core
@server-policy
@workstation-policy
%end

%post
/usr/bin/yum -y update
echo 'deploy ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers
%end

```

So, if you want to use already prepared kickstart file, you need to boot from install image. Usually it is net install image that is mounted to your virtual cdrom drive. You need to press ESC button after the menu with install options is appeared. After that just type command `boot: linux ks=http://hostname.com/path/to/your/kickstart/file.cfg`. If DHCP on your server works properly, you can get cup of coffee while installation process is running. Otherwise try to provide IP address and DNS servers by passing additional parameters, for example `boot: linux ks=http://hostname.com/path/to/your/kickstart/file.cfg ip=192.168.1.101 dns=192.168.0.1`.

If your kickstart file is correct, just wait few minutes and your OS will be ready to provisioning. I hope, you really appreciate your time and already use tools like ansible, chef or puppet for automation provisioning process of your servers.
