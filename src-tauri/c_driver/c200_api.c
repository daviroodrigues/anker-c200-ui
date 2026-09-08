#include "c200_api.h"
#include "c200_controls.h"
#include "c200_fov.h"
#include "c200_vendor.h"
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <linux/videodev2.h>
#include <sys/ioctl.h>

static int v4l2_get_value(int fd, uint32_t id, int32_t *value)
{
	struct v4l2_control control = {.id = id};
	if (value == NULL) {
		errno = EINVAL;
		return -1;
	}
	if (ioctl(fd, VIDIOC_G_CTRL, &control) < 0) {
		return -1;
	}
	*value = control.value;
	return 0;
}

static int v4l2_set_value(int fd, uint32_t id, int32_t value)
{
	struct v4l2_control control = {.id = id, .value = value};
	return ioctl(fd, VIDIOC_S_CTRL, &control);
}

static int v4l2_get_resolution(int fd, char *out, size_t out_len)
{
	struct v4l2_format fmt;
	memset(&fmt, 0, sizeof(fmt));
	fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
	if (ioctl(fd, VIDIOC_G_FMT, &fmt) < 0) {
		return -1;
	}
	snprintf(out, out_len, "%ux%u", fmt.fmt.pix.width, fmt.fmt.pix.height);
	return 0;
}

static int v4l2_set_resolution(int fd, const char *val)
{
	uint32_t w = 1920, h = 1080;
	if (strcasecmp(val, "360") == 0 || strcasecmp(val, "360p") == 0) {
		w = 640; h = 360;
	} else if (strcasecmp(val, "720") == 0 || strcasecmp(val, "720p") == 0) {
		w = 1280; h = 720;
	} else if (strcasecmp(val, "1080") == 0 || strcasecmp(val, "1080p") == 0) {
		w = 1920; h = 1080;
	} else if (strcasecmp(val, "2k") == 0 || strcasecmp(val, "1440p") == 0) {
		w = 2560; h = 1440;
	} else if (sscanf(val, "%ux%u", &w, &h) != 2) {
		errno = EINVAL;
		return -1;
	}

	struct v4l2_format fmt;
	memset(&fmt, 0, sizeof(fmt));
	fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
	if (ioctl(fd, VIDIOC_G_FMT, &fmt) < 0) {
		return -1;
	}

	fmt.fmt.pix.width = w;
	fmt.fmt.pix.height = h;
	fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_MJPEG;
	fmt.fmt.pix.field = V4L2_FIELD_ANY;

	if (ioctl(fd, VIDIOC_S_FMT, &fmt) == 0) {
		return 0;
	}

	if (errno == EBUSY) {
		return -1;
	}

	memset(&fmt, 0, sizeof(fmt));
	fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
	if (ioctl(fd, VIDIOC_G_FMT, &fmt) == 0) {
		fmt.fmt.pix.width = w;
		fmt.fmt.pix.height = h;
		if (ioctl(fd, VIDIOC_S_FMT, &fmt) == 0) {
			return 0;
		}
	}

	return -1;
}

int c200_control_get(int fd, const char *name, char *out, size_t out_len)
{
	if (name == NULL || out == NULL || out_len == 0) {
		errno = EINVAL;
		return -1;
	}

	if (strcasecmp(name, "resolution") == 0) {
		return v4l2_get_resolution(fd, out, out_len);
	}

	if (strcasecmp(name, "mic_mode") == 0) {
		uint8_t mode = 0;
		if (c200_vendor_get_mic(fd, &mode) < 0) {
			return -1;
		}
		snprintf(out, out_len, "%s", mode == 90 ? "90" : "360");
		return 0;
	}

	const struct c200_control_info *control = c200_find_control(name);
	if (control == NULL) {
		errno = ENOENT;
		return -1;
	}

	bool bool_val = false;
	uint8_t u8_val = 0;
	uint16_t u16_val = 0;
	int32_t v4l2_val = 0;

	switch (control->kind) {
	case C200_CONTROL_KIND_VENDOR_BOOL:
		if (c200_vendor_get_bool(fd, (uint8_t)control->id, &bool_val) < 0) {
			return -1;
		}
		snprintf(out, out_len, "%s", c200_format_bool(bool_val));
		return 0;
	case C200_CONTROL_KIND_VENDOR_U8:
		if (c200_vendor_get_u8(fd, (uint8_t)control->id, &u8_val) < 0) {
			return -1;
		}
		snprintf(out, out_len, "%u", u8_val);
		return 0;
	case C200_CONTROL_KIND_VENDOR_FOV:
		if (c200_fov_get(fd, &u16_val) < 0) {
			return -1;
		}
		snprintf(out, out_len, "%s", c200_fov_describe_value(u16_val));
		return 0;
	case C200_CONTROL_KIND_V4L2_BOOL:
		if (v4l2_get_value(fd, control->id, &v4l2_val) < 0) {
			return -1;
		}
		snprintf(out, out_len, "%s", c200_format_bool(v4l2_val != 0));
		return 0;
	case C200_CONTROL_KIND_V4L2_INT:
	case C200_CONTROL_KIND_V4L2_MENU:
		if (v4l2_get_value(fd, control->id, &v4l2_val) < 0) {
			return -1;
		}
		snprintf(out, out_len, "%d", v4l2_val);
		return 0;
	}

	errno = EINVAL;
	return -1;
}

int c200_control_set(int fd, const char *name, const char *val)
{
	if (name == NULL || val == NULL) {
		errno = EINVAL;
		return -1;
	}

	if (strcasecmp(name, "resolution") == 0) {
		return v4l2_set_resolution(fd, val);
	}

	if (strcasecmp(name, "mic_mode") == 0) {
		uint8_t mode = 0;
		if (strcasecmp(val, "90") == 0) {
			mode = 90;
		} else if (strcasecmp(val, "360") == 0) {
			mode = 0;
		} else {
			errno = EINVAL;
			return -1;
		}
		return c200_vendor_set_mic(fd, mode);
	}

	const struct c200_control_info *control = c200_find_control(name);
	if (control == NULL) {
		errno = ENOENT;
		return -1;
	}

	bool bool_val = false;
	uint16_t u16_val = 0;
	long parsed = 0;
	char *end = NULL;

	switch (control->kind) {
	case C200_CONTROL_KIND_VENDOR_BOOL:
		if (!c200_parse_bool(val, &bool_val)) {
			errno = EINVAL;
			return -1;
		}
		return c200_vendor_set_bool(fd, (uint8_t)control->id, bool_val);
	case C200_CONTROL_KIND_VENDOR_U8:
		parsed = strtol(val, &end, 10);
		if (end == val || *end != '\0' || parsed < 0 || parsed > 255) {
			errno = EINVAL;
			return -1;
		}
		return c200_vendor_set_u8(fd, (uint8_t)control->id, (uint8_t)parsed);
	case C200_CONTROL_KIND_VENDOR_FOV:
		if (!c200_fov_parse_value(val, &u16_val)) {
			errno = EINVAL;
			return -1;
		}
		return c200_fov_set(fd, u16_val);
	case C200_CONTROL_KIND_V4L2_BOOL:
		if (!c200_parse_bool(val, &bool_val)) {
			errno = EINVAL;
			return -1;
		}
		return v4l2_set_value(fd, control->id, bool_val ? 1 : 0);
	case C200_CONTROL_KIND_V4L2_INT:
	case C200_CONTROL_KIND_V4L2_MENU:
		parsed = strtol(val, &end, 10);
		if (end == val || *end != '\0') {
			errno = EINVAL;
			return -1;
		}
		return v4l2_set_value(fd, control->id, (int32_t)parsed);
	}

	errno = EINVAL;
	return -1;
}
