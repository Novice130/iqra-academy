import 'package:flutter/material.dart';

import '../config/theme.dart';

class BrandLogo extends StatelessWidget {
  const BrandLogo({
    super.key,
    this.size = 48,
    this.radius = 16,
    this.padding,
  });

  final double size;
  final double radius;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: padding ?? EdgeInsets.all(size * 0.12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: IqraTheme.slate900.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Image.asset(
        'assets/images/logo.png',
        fit: BoxFit.contain,
      ),
    );
  }
}

class BrandWordmark extends StatelessWidget {
  const BrandWordmark({
    super.key,
    this.compact = false,
    this.showSubtitle = false,
    this.textColor,
  });

  final bool compact;
  final bool showSubtitle;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = textColor ?? IqraTheme.slate900;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandLogo(
          size: compact ? 36 : 56,
          radius: compact ? 12 : 18,
        ),
        SizedBox(width: compact ? 10 : 14),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Iqra Academy',
              style: (compact ? theme.textTheme.titleMedium : theme.textTheme.headlineSmall)?.copyWith(
                color: primaryColor,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (showSubtitle)
              Text(
                'Online Quran learning',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: IqraTheme.slate500,
                ),
              ),
          ],
        ),
      ],
    );
  }
}
