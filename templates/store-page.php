<?php
/**
 * Full-window store page (used only for the configured store page in "Full window" mode).
 *
 * @package Aisleza
 */

defined( 'ABSPATH' ) || exit;

?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<main class="aisleza-page">
	<h1 class="screen-reader-text"><?php echo esc_html( get_the_title() ); ?></h1>
	<?php
	$aisleza_store = \Aisleza\Plugin::service( 'shortcode' );
	if ( $aisleza_store instanceof \Aisleza\Frontend\Shortcode ) {
		echo wp_kses( $aisleza_store->render(), \Aisleza\Frontend\Shortcode::KSES );
	}
	?>
</main>
<?php wp_footer(); ?>
</body>
</html>
