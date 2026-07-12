#!/usr/bin/env python3
"""Run a command inside a real PTY, proxying stdio over plain pipes."""
import fcntl
import os
import pty
import select
import struct
import sys
import termios

cmd = sys.argv[1:]
pid, fd = pty.fork()
if pid == 0:
    os.execvpe(cmd[0], cmd, os.environ)

# give the TUI a sane window
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))

try:
    while True:
        r, _, _ = select.select([fd, 0], [], [], 0.1)
        if fd in r:
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data:
                break
            os.write(1, data)
        if 0 in r:
            data = os.read(0, 4096)
            if not data:
                continue
            os.write(fd, data)
finally:
    try:
        os.kill(pid, 9)
    except ProcessLookupError:
        pass
