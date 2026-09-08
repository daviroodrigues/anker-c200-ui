#include "c200_resolution.h"
#include <linux/videodev2.h>
#include <sys/ioctl.h>
#include <string.h>

int c200_set_resolution(int fd, uint32_t width, uint32_t height)
{
    struct v4l2_format fmt;
    memset(&fmt, 0, sizeof(fmt));

    fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    fmt.fmt.pix.width = width;
    fmt.fmt.pix.height = height;
    fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_MJPEG;

    if (ioctl(fd, VIDIOC_S_FMT, &fmt) < 0) {
        return -1;
    }

    return 0;
}
